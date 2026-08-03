/* global chrome */

const REQUEST_EVENT = "shoppingday:rank-extension-request";
const RESULT_EVENT = "shoppingday:rank-extension-result";
const STATUS_EVENT = "shoppingday:rank-extension-status";
const PING_EVENT = "shoppingday:rank-extension-ping";
const SUPPLIER_REQUEST_EVENT = "shoppingday:supplier-check-request";
const SUPPLIER_RESULT_EVENT = "shoppingday:supplier-check-result";
const CATALOG_START_EVENT = "shoppingday:zicgam-catalog-start";
const CATALOG_STOP_EVENT = "shoppingday:zicgam-catalog-stop";
const CATALOG_PROGRESS_EVENT = "shoppingday:zicgam-catalog-progress";

window.addEventListener(PING_EVENT, () => {
  void reportStatus();
});

window.addEventListener(REQUEST_EVENT, (event) => {
  void chrome.runtime
    .sendMessage({
      type: "shoppingday.rank.request",
      payload: event.detail,
    })
    .then((response) => {
      if (response?.ok) return;
      dispatchResult(event.detail?.requestId, {
        device: "pc",
        status: "failed",
        rank: null,
        checkedRange: 1,
        observedAt: new Date().toISOString(),
        message:
          response?.message ?? "Chrome 확장 프로그램 요청에 실패했습니다.",
      });
    })
    .catch((error) => {
      dispatchResult(event.detail?.requestId, {
        device: "pc",
        status: "failed",
        rank: null,
        checkedRange: 1,
        observedAt: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "Chrome 확장 프로그램과 통신하지 못했습니다.",
      });
    });
});

window.addEventListener(SUPPLIER_REQUEST_EVENT, (event) => {
  void chrome.runtime
    .sendMessage({
      type: "shoppingday.supplier.request",
      payload: event.detail,
    })
    .then((response) => {
      if (response?.ok) return;
      dispatchSupplierResult(event.detail?.requestId, failedSupplierResult(
        event.detail?.url,
        response?.message ?? "공급처 재고 확인 요청에 실패했습니다.",
      ));
    })
    .catch((error) => {
      dispatchSupplierResult(
        event.detail?.requestId,
        failedSupplierResult(
          event.detail?.url,
          error instanceof Error
            ? error.message
            : "Chrome 확장 프로그램과 통신하지 못했습니다.",
        ),
      );
    });
});

window.addEventListener(CATALOG_START_EVENT, (event) => {
  void chrome.runtime
    .sendMessage({
      type: "shoppingday.zicgam.catalog.start",
      payload: event.detail,
    })
    .then((response) => {
      if (response?.ok) return;
      dispatchCatalogProgress(event.detail?.requestId, {
        phase: "failed",
        message: response?.message ?? "직감 전체 가져오기를 시작하지 못했습니다.",
      });
    })
    .catch((error) => {
      dispatchCatalogProgress(event.detail?.requestId, {
        phase: "failed",
        message: error instanceof Error ? error.message : "확장 프로그램과 통신하지 못했습니다.",
      });
    });
});

window.addEventListener(CATALOG_STOP_EVENT, (event) => {
  void chrome.runtime
    .sendMessage({ type: "shoppingday.zicgam.catalog.stop" })
    .then(() => dispatchCatalogProgress(event.detail?.requestId, { phase: "stopped" }));
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "shoppingday.rank.result") {
    dispatchResult(message.requestId, message.result);
  }
  if (message?.type === "shoppingday.supplier.result") {
    dispatchSupplierResult(message.requestId, message.result);
  }
  if (message?.type === "shoppingday.zicgam.catalog.product") {
    void saveCatalogProduct(message).then(sendResponse);
    return true;
  }
  if (message?.type === "shoppingday.zicgam.catalog.batch_start") {
    void startCatalogBatch(message).then(sendResponse);
    return true;
  }
  if (message?.type === "shoppingday.zicgam.catalog.batch_chunk") {
    void uploadCatalogBatchChunk(message).then(sendResponse);
    return true;
  }
  if (message?.type === "shoppingday.zicgam.catalog.batch_dispatch") {
    void dispatchCatalogBatch(message).then(sendResponse);
    return true;
  }
  if (message?.type === "shoppingday.zicgam.catalog.discovery_complete") {
    const total = Number(message.progress?.discoveredProducts ?? 0);
    const pages = Number(message.progress?.listPages ?? 0);
    const displayedTotal = message.progress?.displayedTotal;
    const terminalEmptyPage = Number(message.progress?.terminalEmptyPage ?? pages + 1);
    dispatchCatalogProgress(message.requestId, {
      phase: "discovery_complete",
      progress: message.progress,
    });
    const siteTotalMessage =
      Number.isInteger(displayedTotal) && displayedTotal >= 0
        ? ` 사이트 표시 전체 수는 ${displayedTotal.toLocaleString("ko-KR")}개입니다${displayedTotal === total ? "(일치)." : "(목록 발견 수와 다름)."}`
        : " 사이트 표시 전체 수는 읽지 못했지만 빈 페이지 기준으로 끝을 확인했습니다.";
    const approved = window.confirm(
      `직감 전체상품 ${pages.toLocaleString("ko-KR")}페이지에서 고유 상품 ${total.toLocaleString("ko-KR")}개를 확인했고, ${terminalEmptyPage.toLocaleString("ko-KR")}페이지가 비어 있어 목록의 끝으로 판정했습니다.${siteTotalMessage} 상품 상세 정보 저장을 시작할까요?`,
    );
    sendResponse({ ok: approved, cancelled: !approved });
    return;
  }
  if (message?.type?.startsWith("shoppingday.zicgam.catalog.")) {
    dispatchCatalogProgress(message.requestId, catalogProgressDetail(message));
    sendResponse({ ok: true });
  }
});

void reportStatus();

async function reportStatus() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "shoppingday.rank.ping",
    });
    window.dispatchEvent(
      new CustomEvent(STATUS_EVENT, {
        detail: {
          available: Boolean(response?.ok),
          version: response?.version ?? null,
        },
      }),
    );
    if (response?.catalog?.active && response.catalog.latest) {
      dispatchCatalogProgress(response.catalog.requestId, {
        ...catalogProgressDetail(response.catalog.latest),
        counts: response.catalog.stats,
        restored: true,
        updatedAt: response.catalog.latest.updatedAt,
      });
    }
  } catch {
    window.dispatchEvent(
      new CustomEvent(STATUS_EVENT, {
        detail: { available: false, version: null },
      }),
    );
  }
}

function dispatchResult(requestId, result) {
  window.dispatchEvent(
    new CustomEvent(RESULT_EVENT, {
      detail: { requestId, result },
    }),
  );
}

function dispatchSupplierResult(requestId, result) {
  window.dispatchEvent(
    new CustomEvent(SUPPLIER_RESULT_EVENT, {
      detail: { requestId, result },
    }),
  );
}

function failedSupplierResult(url, message) {
  return {
    provider: "zicgam",
    status: "failed",
    productName: null,
    checkedAt: new Date().toISOString(),
    source: "chrome_extension",
    url: typeof url === "string" && url ? url : "https://zicgam.com/",
    evidence: [message],
    availableOptions: [],
    soldOutOptions: [],
  };
}

async function startCatalogBatch(message) {
  try {
    const response = await fetch("/api/suppliers/zicgam/products/sync", {
      method: "POST",
      credentials: "same-origin",
      signal: AbortSignal.timeout(45_000),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success || !body.job?.id || !body.uploadToken) {
      throw new Error(body?.error?.message ?? `직감 작업 생성 HTTP ${response.status}`);
    }
    dispatchCatalogProgress(message.requestId, {
      phase: "capturing",
      progress: message.progress,
      message: "상품 상세정보를 수집 파일로 만들고 있습니다.",
    });
    return { ok: true, jobId: body.job.id, uploadToken: body.uploadToken };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "직감 작업을 만들지 못했습니다." };
  }
}

async function uploadCatalogBatchChunk(message) {
  try {
    const { jobId, uploadToken, chunkIndex, products } = message.payload ?? {};
    if (!jobId || !uploadToken || !Number.isInteger(chunkIndex) || !Array.isArray(products)) {
      throw new Error("직감 수집 청크가 올바르지 않습니다.");
    }
    const compressed = await gzipJson(products);
    const response = await fetch(
      `/api/suppliers/zicgam/products/sync/${encodeURIComponent(jobId)}/chunks/${chunkIndex}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/gzip",
          "x-zicgam-upload-token": uploadToken,
        },
        credentials: "same-origin",
        body: compressed,
        signal: AbortSignal.timeout(60_000),
      },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) {
      throw new Error(body?.error?.message ?? `직감 청크 업로드 HTTP ${response.status}`);
    }
    dispatchCatalogProgress(message.requestId, {
      phase: "capturing",
      progress: message.progress,
      message: `수집 파일 ${chunkIndex + 1}개를 업로드했습니다.`,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "직감 수집 파일을 업로드하지 못했습니다." };
  }
}

async function dispatchCatalogBatch(message) {
  try {
    const { jobId, chunkCount, total } = message.payload ?? {};
    const response = await fetch(
      `/api/suppliers/zicgam/products/sync/${encodeURIComponent(jobId)}/dispatch`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ chunkCount, total }),
        signal: AbortSignal.timeout(45_000),
      },
    );
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) {
      throw new Error(body?.error?.message ?? `GitHub Actions 실행 요청 HTTP ${response.status}`);
    }
    dispatchCatalogProgress(message.requestId, {
      phase: "queued",
      progress: message.progress,
      message: "수집을 마쳤습니다. GitHub Actions DB 저장을 기다리고 있습니다.",
    });
    return { ok: true, job: body.job };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "GitHub Actions 작업을 시작하지 못했습니다." };
  }
}

async function gzipJson(value) {
  const source = new Blob([JSON.stringify(value)], { type: "application/json" });
  const stream = source.stream().pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(stream).arrayBuffer()], { type: "application/gzip" });
}

async function saveCatalogProduct(message) {
  let status = null;
  let retryable = true;
  try {
    const response = await fetch("/api/suppliers/zicgam/products/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(message.product),
      signal: AbortSignal.timeout(45_000),
    });
    status = response.status;
    retryable = response.status === 429 || response.status >= 500;
    const responseText = await response.text();
    const body = parseJson(responseText);
    if (!response.ok || !body?.success) {
      const responseType = response.headers.get("content-type") ?? "알 수 없음";
      const fallback = `직감 저장 HTTP ${response.status} · 응답 ${responseType}`;
      throw new Error(body?.error?.message ?? fallback);
    }
    dispatchCatalogProgress(message.requestId, {
      phase: "importing",
      progress: message.progress,
      result: body,
    });
    return { ok: true, result: body };
  } catch (error) {
    const detail = {
      phase: "item_failed",
      progress: message.progress,
      url: message.product?.url,
      message: error instanceof Error ? error.message : "직감 상품 저장에 실패했습니다.",
    };
    return { ok: false, message: detail.message, retryable, status };
  }
}

function parseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function catalogProgressDetail(message) {
  const suffix = message.type.split(".").at(-1);
  if (suffix === "starting") {
    return { phase: "starting", message: "직감 전체 가져오기를 시작하고 있습니다." };
  }
  if (suffix === "discovery") return { phase: "discovering", progress: message.progress };
  if (suffix === "discovery_complete") {
    return {
      phase: "discovery_complete",
      progress: message.progress,
      message: "전체상품 목록 확인을 마쳤습니다.",
    };
  }
  if (suffix === "batch_start" || suffix === "batch_chunk") {
    return {
      phase: "capturing",
      progress: message.progress,
      message: "직감 상품을 수집 파일로 만들고 있습니다.",
    };
  }
  if (suffix === "batch_dispatch" || suffix === "capture_complete") {
    return {
      phase: "queued",
      progress: message.progress,
      summary: message.summary,
      message: "GitHub Actions DB 저장을 기다리고 있습니다.",
    };
  }
  if (
    suffix === "import_started" ||
    suffix === "item_started" ||
    suffix === "product" ||
    suffix === "product_saved"
  ) {
    return {
      phase: "importing",
      progress: message.progress,
      result: message.result,
      url: message.url,
      message:
        suffix === "import_started"
          ? "상품 상세 정보 저장을 시작합니다."
          : suffix === "product_saved"
            ? `${message.progress?.processed ?? 0}개 상품 저장을 완료했습니다.`
            : `${message.progress?.current ?? (message.progress?.processed ?? 0) + 1}번째 상품 상세 정보를 확인하고 있습니다.`,
    };
  }
  if (suffix === "retry_wait") {
    return {
      phase: "importing",
      progress: message.progress,
      message: `Shoppingday 서버가 응답하지 않아 ${message.progress?.retryDelaySeconds ?? 0}초 후 재시도합니다 (${message.progress?.retryAttempt ?? 0}/4).`,
    };
  }
  if (suffix === "item_failed") {
    return { phase: "item_failed", progress: message.progress, url: message.url, message: message.message };
  }
  if (suffix === "complete") return { phase: "complete", summary: message.summary };
  return { phase: "failed", message: message.message ?? "직감 전체 가져오기에 실패했습니다." };
}

function dispatchCatalogProgress(requestId, detail) {
  window.dispatchEvent(
    new CustomEvent(CATALOG_PROGRESS_EVENT, {
      detail: { requestId, ...detail },
    }),
  );
}
