/* global chrome, ShoppingdayZicgamCatalogParser, ShoppingdayZicgamStockParser */

void runCatalogImport();

async function runCatalogImport() {
  const ready = await chrome.runtime
    .sendMessage({ type: "shoppingday.zicgam.catalog.ready" })
    .catch(() => null);
  if (!ready?.ok || !ready.payload) return;
  const request = ready.payload;
  try {
    const productUrls = await discoverCatalog(request);
    if (productUrls.length !== request.expectedTotal) {
      throw new Error(
        `직감 표시 상품 ${request.expectedTotal}개와 발견 상품 ${productUrls.length}개가 달라 상세 저장을 시작하지 않았습니다.`,
      );
    }
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    for (const url of productUrls) {
      try {
        const page = await fetchDocument(url);
        const product = ShoppingdayZicgamCatalogParser.extractProduct(
          page.document,
          page.url,
          ShoppingdayZicgamStockParser,
        );
        const response = await chrome.runtime.sendMessage({
          type: "shoppingday.zicgam.catalog.product",
          product,
          progress: { processed: processed + 1, total: productUrls.length },
        });
        if (response?.cancelled) return;
        if (!response?.ok) throw new Error(response?.message ?? "상품 저장 실패");
        succeeded += 1;
        consecutiveFailures = 0;
      } catch (error) {
        if (error?.code === "auth_required") throw error;
        failed += 1;
        consecutiveFailures += 1;
        const response = await chrome.runtime.sendMessage({
          type: "shoppingday.zicgam.catalog.item_failed",
          url,
          message: error instanceof Error ? error.message : "상품 판독 실패",
          progress: { processed: processed + 1, total: productUrls.length },
        });
        if (response?.cancelled) return;
        if (consecutiveFailures >= 20) {
          throw new Error("상품 판독이 20회 연속 실패해 작업을 중단했습니다.");
        }
      }
      processed += 1;
      await delay(request.delayMs);
    }
    await chrome.runtime.sendMessage({
      type: "shoppingday.zicgam.catalog.complete",
      summary: { total: productUrls.length, processed, succeeded, failed },
    });
  } catch (error) {
    await chrome.runtime.sendMessage({
      type: "shoppingday.zicgam.catalog.failed",
      message:
        error instanceof Error
          ? error.message
          : "직감 전체 상품 가져오기에 실패했습니다.",
    });
  }
}

async function discoverCatalog(request) {
  const queue = [request.startUrl];
  const visited = new Set();
  const products = new Map();
  while (queue.length) {
    if (visited.size >= request.maximumListPages) {
      throw new Error("직감 목록 페이지 안전 한도를 초과했습니다.");
    }
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    const page = url === location.href
      ? { document, url: location.href }
      : await fetchDocument(url);
    if (
      new URL(page.url).pathname.includes("/member/login") ||
      page.document.querySelector("form[action*='/member/login'], input[name='member_id']")
    ) {
      throw Object.assign(
        new Error("직감 로그인 또는 승인회원 확인이 필요합니다."),
        { code: "auth_required" },
      );
    }
    const found = ShoppingdayZicgamCatalogParser.discoverPage(
      page.document,
      page.url,
    );
    for (const productUrl of found.productUrls) {
      const id = ShoppingdayZicgamCatalogParser.productNo(new URL(productUrl));
      if (id) products.set(id, productUrl);
    }
    for (const listUrl of found.listUrls) {
      if (!visited.has(listUrl) && !queue.includes(listUrl)) queue.push(listUrl);
    }
    const progress = await chrome.runtime.sendMessage({
      type: "shoppingday.zicgam.catalog.discovery",
      progress: {
        listPages: visited.size,
        pendingListPages: queue.length,
        discoveredProducts: products.size,
      },
    });
    if (progress?.cancelled) throw new Error("사용자가 가져오기를 중단했습니다.");
    await delay(request.discoveryDelayMs);
  }
  if (!products.size) {
    throw new Error("직감 상품 목록에서 상품 상세 주소를 찾지 못했습니다.");
  }
  return [...products.entries()]
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, url]) => url);
}

async function fetchDocument(url) {
  const response = await fetch(url, { credentials: "include", redirect: "follow" });
  if (!response.ok) throw new Error(`직감 페이지 HTTP ${response.status}`);
  const html = await response.text();
  return {
    document: new DOMParser().parseFromString(html, "text/html"),
    url: response.url || url,
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
