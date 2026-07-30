/* global chrome */

const PENDING_PREFIX = "rank-pending:";
const SUPPLIER_WORKER_PREFIX = "supplier-worker:";
const ALLOWED_APP_ORIGINS = new Set([
  "https://shoppingday.ssmh07.workers.dev",
  "http://localhost:3000",
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then((response) => sendResponse(response))
    .catch((error) =>
      sendResponse({
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "확장 프로그램 요청을 처리하지 못했습니다.",
      }),
    );
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session.remove(pendingKey(tabId));
});

async function handleMessage(message, sender) {
  if (message?.type === "shoppingday.rank.ping") {
    assertShoppingdaySender(sender);
    return { ok: true, version: chrome.runtime.getManifest().version };
  }

  if (message?.type === "shoppingday.rank.request") {
    assertShoppingdaySender(sender);
    const request = validateRankRequest(message.payload);
    const sourceTabId = sender.tab?.id;
    if (!sourceTabId) throw new Error("Shoppingday 탭을 확인하지 못했습니다.");

    const searchUrl = new URL(
      "https://search.shopping.naver.com/search/all",
    );
    searchUrl.searchParams.set("query", request.keyword);
    const tab = await chrome.tabs.create({ url: "about:blank", active: true });
    if (!tab.id) throw new Error("네이버쇼핑 검색 탭을 열지 못했습니다.");

    await chrome.storage.session.set({
      [pendingKey(tab.id)]: {
        kind: "rank",
        sourceTabId,
        requestId: request.requestId,
        payload: request,
        createdAt: Date.now(),
      },
    });
    await chrome.tabs.update(tab.id, { url: searchUrl.toString() });
    return { ok: true };
  }

  if (message?.type === "shoppingday.rank.ready") {
    assertNaverSender(sender);
    const pending = await getPending(sender.tab?.id);
    return pending?.kind === "rank"
      ? { ok: true, payload: pending.payload }
      : { ok: false, message: "대기 중인 순위 조회가 없습니다." };
  }

  if (message?.type === "shoppingday.rank.result") {
    assertNaverSender(sender);
    const naverTabId = sender.tab?.id;
    const pending = await getPending(naverTabId);
    if (!pending) {
      return { ok: false, message: "순위 조회 요청이 만료되었습니다." };
    }
    await chrome.tabs.sendMessage(pending.sourceTabId, {
      type: "shoppingday.rank.result",
      requestId: pending.requestId,
      result: message.result,
    });
    await chrome.tabs.update(pending.sourceTabId, { active: true });
    await chrome.storage.session.remove(pendingKey(naverTabId));
    return { ok: true };
  }

  if (message?.type === "shoppingday.supplier.request") {
    assertShoppingdaySender(sender);
    const request = validateSupplierRequest(message.payload);
    const sourceTabId = sender.tab?.id;
    if (!sourceTabId) throw new Error("Shoppingday 탭을 확인하지 못했습니다.");

    const tab = await getOrCreateSupplierTab(
      sourceTabId,
      !request.background,
    );
    await chrome.storage.session.set({
      [pendingKey(tab.id)]: {
        kind: "supplier",
        sourceTabId,
        requestId: request.requestId,
        payload: request,
        createdAt: Date.now(),
      },
    });
    await chrome.tabs.update(tab.id, {
      url: request.url,
      active: !request.background,
    });
    return { ok: true };
  }

  if (message?.type === "shoppingday.supplier.ready") {
    assertZicgamSender(sender);
    const pending = await getPending(sender.tab?.id);
    return pending?.kind === "supplier"
      ? { ok: true, payload: pending.payload }
      : { ok: false, message: "대기 중인 공급처 재고 확인이 없습니다." };
  }

  if (message?.type === "shoppingday.supplier.result") {
    assertZicgamSender(sender);
    const supplierTabId = sender.tab?.id;
    const pending = await getPending(supplierTabId);
    if (!pending || pending.kind !== "supplier") {
      return { ok: false, message: "공급처 재고 확인 요청이 만료되었습니다." };
    }
    await chrome.tabs.sendMessage(pending.sourceTabId, {
      type: "shoppingday.supplier.result",
      requestId: pending.requestId,
      result: message.result,
    });
    if (!pending.payload.background) {
      await chrome.tabs.update(pending.sourceTabId, { active: true });
    }
    await chrome.storage.session.remove(pendingKey(supplierTabId));
    return { ok: true };
  }

  return { ok: false, message: "지원하지 않는 요청입니다." };
}

function validateRankRequest(value) {
  const requestId =
    typeof value?.requestId === "string" ? value.requestId.trim() : "";
  const keyword = typeof value?.keyword === "string" ? value.keyword.trim() : "";
  const channelProductNo =
    typeof value?.channelProductNo === "string"
      ? value.channelProductNo.trim()
      : "";
  const smartstoreUrl =
    typeof value?.smartstoreUrl === "string" ? value.smartstoreUrl.trim() : "";
  if (!requestId || requestId.length > 100) {
    throw new Error("순위 조회 요청 ID가 올바르지 않습니다.");
  }
  if (!keyword || keyword.length > 100) {
    throw new Error("확인할 키워드를 입력해 주세요.");
  }
  if (!/^\d{1,20}$/.test(channelProductNo)) {
    throw new Error("네이버 채널 상품번호가 올바르지 않습니다.");
  }
  const targetUrl = new URL(smartstoreUrl);
  if (
    targetUrl.protocol !== "https:" ||
    !(
      targetUrl.hostname.endsWith(".naver.com") ||
      targetUrl.hostname === "naver.com"
    )
  ) {
    throw new Error("스마트스토어 상품 주소가 올바르지 않습니다.");
  }
  return {
    requestId,
    keyword,
    channelProductNo,
    smartstoreUrl: targetUrl.toString(),
    maximumRank: 100,
  };
}

function validateSupplierRequest(value) {
  const requestId =
    typeof value?.requestId === "string" ? value.requestId.trim() : "";
  const rawUrl = typeof value?.url === "string" ? value.url.trim() : "";
  if (!requestId || requestId.length > 100) {
    throw new Error("공급처 확인 요청 ID가 올바르지 않습니다.");
  }
  const url = new URL(rawUrl);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "zicgam.com" ||
    url.pathname !== "/product/detail.html" ||
    !/^\d+$/.test(url.searchParams.get("product_no") ?? "")
  ) {
    throw new Error("현재는 직감 상품 상세 URL만 확인할 수 있습니다.");
  }
  return {
    requestId,
    provider: "zicgam",
    url: url.toString(),
    background: value?.background === true,
  };
}

function assertShoppingdaySender(sender) {
  const origin = sender.url ? new URL(sender.url).origin : "";
  const isLocal =
    origin.startsWith("http://localhost:") ||
    origin.startsWith("http://127.0.0.1:");
  if (!ALLOWED_APP_ORIGINS.has(origin) && !isLocal) {
    throw new Error("허용되지 않은 Shoppingday 페이지입니다.");
  }
}

function assertNaverSender(sender) {
  if (
    !sender.url ||
    new URL(sender.url).hostname !== "search.shopping.naver.com"
  ) {
    throw new Error("허용되지 않은 네이버쇼핑 페이지입니다.");
  }
}

function assertZicgamSender(sender) {
  if (!sender.url || new URL(sender.url).hostname !== "zicgam.com") {
    throw new Error("허용되지 않은 직감 페이지입니다.");
  }
}

async function getPending(tabId) {
  if (!tabId) return null;
  const key = pendingKey(tabId);
  const stored = await chrome.storage.session.get(key);
  const pending = stored[key];
  if (!pending) return null;
  if (Date.now() - pending.createdAt > 2 * 60 * 1000) {
    await chrome.storage.session.remove(key);
    return null;
  }
  return pending;
}

function pendingKey(tabId) {
  return `${PENDING_PREFIX}${tabId}`;
}

async function getOrCreateSupplierTab(sourceTabId, active) {
  const workerKey = `${SUPPLIER_WORKER_PREFIX}${sourceTabId}`;
  const stored = await chrome.storage.session.get(workerKey);
  const existingTabId = stored[workerKey];
  if (Number.isInteger(existingTabId)) {
    const existing = await chrome.tabs.get(existingTabId).catch(() => null);
    if (existing?.id) return existing;
  }
  const tab = await chrome.tabs.create({ url: "about:blank", active });
  if (!tab.id) throw new Error("공급처 상품 탭을 열지 못했습니다.");
  await chrome.storage.session.set({ [workerKey]: tab.id });
  return tab;
}
