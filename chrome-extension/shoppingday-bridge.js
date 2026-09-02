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
const KEYWORD_EXPOSURE_REQUEST_EVENT = "shoppingday:keyword-exposure-request";
const KEYWORD_EXPOSURE_RESULT_EVENT = "shoppingday:keyword-exposure-result";
const SMARTSTORE_REVIEW_REQUEST_EVENT = "shoppingday:smartstore-review-request";
const SMARTSTORE_REVIEW_RESULT_EVENT = "shoppingday:smartstore-review-result";
const EXTENSION_CONTEXT_MESSAGE =
  "Chrome 확장 프로그램이 업데이트되었습니다. 확장 프로그램을 다시 불러온 뒤 Shoppingday 페이지를 새로고침해 주세요.";
const catalogProviders = new Map();

window.addEventListener(PING_EVENT, () => {
  void reportStatus();
});

window.addEventListener(REQUEST_EVENT, (event) => {
  void sendRuntimeMessage({
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

window.addEventListener(KEYWORD_EXPOSURE_REQUEST_EVENT, (event) => {
  void sendRuntimeMessage({
    type: "shoppingday.keyword-exposure.request",
    payload: event.detail,
  })
    .then((response) => {
      if (response?.ok) return;
      dispatchKeywordExposureResult(event.detail?.requestId, {
        keyword: event.detail?.keyword ?? "",
        device: "pc",
        status: "failed",
        productCount: 0,
        titleMatchCount: 0,
        attributeMatchCount: 0,
        categoryMatchCount: 0,
        contextKeyword: event.detail?.contextKeyword ?? "",
        contextMatchCount: 0,
        contextCategoryId: event.detail?.contextCategoryId ?? "",
        contextCategoryName: event.detail?.contextCategoryName ?? "",
        contextCategoryMatchCount: 0,
        categoryDistribution: [],
        observedAt: new Date().toISOString(),
        samples: [],
        message: response?.message ?? "키워드 노출 분석 요청에 실패했습니다.",
      });
    })
    .catch((error) => {
      dispatchKeywordExposureResult(event.detail?.requestId, {
        keyword: event.detail?.keyword ?? "",
        device: "pc",
        status: "failed",
        productCount: 0,
        titleMatchCount: 0,
        attributeMatchCount: 0,
        categoryMatchCount: 0,
        contextKeyword: event.detail?.contextKeyword ?? "",
        contextMatchCount: 0,
        contextCategoryId: event.detail?.contextCategoryId ?? "",
        contextCategoryName: event.detail?.contextCategoryName ?? "",
        contextCategoryMatchCount: 0,
        categoryDistribution: [],
        observedAt: new Date().toISOString(),
        samples: [],
        message:
          error instanceof Error
            ? error.message
            : "Chrome 확장 프로그램과 통신하지 못했습니다.",
      });
    });
});

window.addEventListener(SMARTSTORE_REVIEW_REQUEST_EVENT, (event) => {
  void sendRuntimeMessage({
    type: "shoppingday.smartstore-review.request",
    payload: event.detail,
  })
    .then((response) => {
      if (response?.ok) return;
      dispatchSmartstoreReviewResult(event.detail?.requestId, {
        status: "failed",
        sourceUrl: event.detail?.url ?? "",
        productName: "",
        reviews: [],
        observedAt: new Date().toISOString(),
        message:
          response?.message ??
          "스마트스토어 리뷰 가져오기를 시작하지 못했습니다.",
      });
    })
    .catch((error) => {
      dispatchSmartstoreReviewResult(event.detail?.requestId, {
        status: "failed",
        sourceUrl: event.detail?.url ?? "",
        productName: "",
        reviews: [],
        observedAt: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "확장 프로그램과 통신하지 못했습니다.",
      });
    });
});

window.addEventListener(SUPPLIER_REQUEST_EVENT, (event) => {
  void sendRuntimeMessage({
    type: "shoppingday.supplier.request",
    payload: event.detail,
  })
    .then((response) => {
      if (response?.ok) return;
      dispatchSupplierResult(
        event.detail?.requestId,
        failedSupplierResult(
          event.detail?.url,
          response?.message ?? "공급처 재고 확인 요청에 실패했습니다.",
        ),
      );
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
  catalogProviders.set(
    event.detail?.requestId,
    event.detail?.provider ?? "zicgam",
  );
  void sendRuntimeMessage({
    type: "shoppingday.zicgam.catalog.start",
    payload: event.detail,
  })
    .then((response) => {
      if (response?.ok) return;
      dispatchCatalogProgress(event.detail?.requestId, {
        phase: "failed",
        message:
          response?.message ?? "공급처 전체 가져오기를 시작하지 못했습니다.",
      });
    })
    .catch((error) => {
      dispatchCatalogProgress(event.detail?.requestId, {
        phase: "failed",
        message:
          error instanceof Error
            ? error.message
            : "확장 프로그램과 통신하지 못했습니다.",
      });
    });
});

window.addEventListener(CATALOG_STOP_EVENT, (event) => {
  void sendRuntimeMessage({ type: "shoppingday.zicgam.catalog.stop" })
    .then(() =>
      dispatchCatalogProgress(event.detail?.requestId, { phase: "stopped" }),
    )
    .catch((error) => {
      dispatchCatalogProgress(event.detail?.requestId, {
        phase: "failed",
        message:
          error instanceof Error ? error.message : EXTENSION_CONTEXT_MESSAGE,
      });
    });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "shoppingday.rank.result") {
    dispatchResult(message.requestId, message.result);
  }
  if (message?.type === "shoppingday.keyword-exposure.result") {
    dispatchKeywordExposureResult(message.requestId, message.result);
  }
  if (message?.type === "shoppingday.smartstore-review.result") {
    dispatchSmartstoreReviewResult(message.requestId, message.result);
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
    const terminalEmptyPage = Number(
      message.progress?.terminalEmptyPage ?? pages + 1,
    );
    dispatchCatalogProgress(message.requestId, {
      phase: "discovery_complete",
      progress: message.progress,
    });
    const siteTotalMessage =
      Number.isInteger(displayedTotal) && displayedTotal >= 0
        ? ` 사이트 표시 전체 수는 ${displayedTotal.toLocaleString("ko-KR")}개입니다${displayedTotal === total ? "(일치)." : "(목록 발견 수와 다름)."}`
        : " 사이트 표시 전체 수는 읽지 못했지만 빈 페이지 기준으로 끝을 확인했습니다.";
    const approved = window.confirm(
      `${message.supplierLabel ?? "공급처"} 전체상품 ${pages.toLocaleString("ko-KR")}페이지에서 고유 상품 ${total.toLocaleString("ko-KR")}개를 확인했고, ${terminalEmptyPage.toLocaleString("ko-KR")}페이지가 비어 있어 목록의 끝으로 판정했습니다.${siteTotalMessage} 상품 상세 정보 저장을 시작할까요?`,
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
    const response = await sendRuntimeMessage({
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
      catalogProviders.set(
        response.catalog.requestId,
        response.catalog.provider ?? "zicgam",
      );
      dispatchCatalogProgress(response.catalog.requestId, {
        ...catalogProgressDetail({
          ...response.catalog.latest,
          provider: response.catalog.provider,
          supplierLabel:
            response.catalog.provider === "ebulsamchon"
              ? "이불삼촌"
              : "직감",
        }),
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

function dispatchKeywordExposureResult(requestId, result) {
  window.dispatchEvent(
    new CustomEvent(KEYWORD_EXPOSURE_RESULT_EVENT, {
      detail: { requestId, result },
    }),
  );
}

function dispatchSmartstoreReviewResult(requestId, result) {
  window.dispatchEvent(
    new CustomEvent(SMARTSTORE_REVIEW_RESULT_EVENT, {
      detail: { requestId, result },
    }),
  );
}

function sendRuntimeMessage(message) {
  try {
    if (!chrome.runtime?.id) {
      return Promise.reject(new Error(EXTENSION_CONTEXT_MESSAGE));
    }
    return chrome.runtime.sendMessage(message).catch((error) => {
      throw normalizeRuntimeError(error);
    });
  } catch (error) {
    return Promise.reject(normalizeRuntimeError(error));
  }
}

function normalizeRuntimeError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /extension context invalidated/i.test(message) || !chrome.runtime?.id
    ? new Error(EXTENSION_CONTEXT_MESSAGE)
    : error instanceof Error
      ? error
      : new Error(message || "Chrome 확장 프로그램과 통신하지 못했습니다.");
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
  const supplierLabel = catalogSupplierLabel(message);
  try {
    const body = await startCatalogBatchWithRetry(message);
    dispatchCatalogProgress(message.requestId, {
      phase: "capturing",
      progress: message.progress,
      message: "상품 상세정보를 수집 파일로 만들고 있습니다.",
    });
    return { ok: true, jobId: body.job.id, uploadToken: body.uploadToken };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : `${supplierLabel} 작업을 만들지 못했습니다.`,
    };
  }
}

async function startCatalogBatchWithRetry(message) {
  const retryDelays = [0, 2_000, 5_000, 10_000, 20_000];
  const supplierLabel = catalogSupplierLabel(message);
  let lastError = `${supplierLabel} 작업을 만들지 못했습니다.`;
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt]) {
      dispatchCatalogProgress(message.requestId, {
        phase: "starting",
        progress: message.progress,
        message: `${supplierLabel} 작업 생성을 재시도합니다 (${attempt}/${retryDelays.length - 1}).`,
      });
      await wait(retryDelays[attempt]);
    }
    try {
      const response = await fetch(
        `/api/suppliers/${catalogProvider(message)}/products/sync`,
        {
          method: "POST",
          credentials: "same-origin",
          signal: AbortSignal.timeout(45_000),
        },
      );
      const body = await response.json().catch(() => null);
      if (response.ok && body?.success && body.job?.id && body.uploadToken) {
        return body;
      }
      if (response.ok) {
        lastError = invalidJsonResponseMessage(
          `${supplierLabel} 작업 생성`,
          response,
          body,
        );
        continue;
      }
      lastError =
        body?.error?.message ??
        `${supplierLabel} 작업 생성 HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

async function uploadCatalogBatchChunk(message) {
  try {
    const { jobId, uploadToken, chunkIndex, products } = message.payload ?? {};
    if (
      !jobId ||
      !uploadToken ||
      !Number.isInteger(chunkIndex) ||
      !Array.isArray(products)
    ) {
      throw new Error("공급처 수집 청크가 올바르지 않습니다.");
    }
    const compressed = await gzipJson(products);
    const signed = await requestSignedChunkUpload(
      jobId,
      uploadToken,
      chunkIndex,
      message,
    );
    await uploadSignedChunk(signed, compressed, chunkIndex, message);
    dispatchCatalogProgress(message.requestId, {
      phase: "capturing",
      progress: message.progress,
      message: `수집 파일 ${chunkIndex + 1}개를 업로드했습니다.`,
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "공급처 수집 파일을 업로드하지 못했습니다.",
    };
  }
}

async function requestSignedChunkUpload(
  jobId,
  uploadToken,
  chunkIndex,
  message,
) {
  const retryDelays = [0, 2_000, 5_000, 10_000, 20_000];
  let lastError = "서명 URL 요청 실패";
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt]) {
      dispatchCatalogProgress(message.requestId, {
        phase: "capturing",
        progress: message.progress,
        message: `수집 파일 ${chunkIndex + 1} 업로드 준비를 재시도합니다 (${attempt}/${retryDelays.length - 1}).`,
      });
      await wait(retryDelays[attempt]);
    }
    try {
      const response = await fetch(
        `/api/suppliers/${catalogProvider(message)}/products/sync/${encodeURIComponent(jobId)}/chunks/${chunkIndex}`,
        {
          method: "POST",
          headers: { "x-zicgam-upload-token": uploadToken },
          credentials: "same-origin",
          signal: AbortSignal.timeout(30_000),
        },
      );
      const body = await response.json().catch(() => null);
      if (response.ok && body?.success && body.signedUrl && body.apiKey)
        return body;
      if (response.ok) {
        lastError = invalidJsonResponseMessage("서명 URL", response, body);
        continue;
      }
      lastError = body?.error?.message ?? `서명 URL HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

async function uploadSignedChunk(signed, compressed, chunkIndex, message) {
  const retryDelays = [0, 2_000, 5_000, 10_000, 20_000];
  let lastError = "Supabase Storage 업로드 실패";
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt]) {
      dispatchCatalogProgress(message.requestId, {
        phase: "capturing",
        progress: message.progress,
        message: `수집 파일 ${chunkIndex + 1} 직접 업로드를 재시도합니다 (${attempt}/${retryDelays.length - 1}).`,
      });
      await wait(retryDelays[attempt]);
    }
    try {
      const form = new FormData();
      form.append("cacheControl", "3600");
      form.append(
        "",
        compressed,
        `${String(chunkIndex).padStart(5, "0")}.json.gz`,
      );
      const response = await fetch(signed.signedUrl, {
        method: "PUT",
        headers: {
          apikey: signed.apiKey,
          authorization: `Bearer ${signed.apiKey}`,
          "x-upsert": "true",
        },
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return;
      const body = await response.json().catch(() => null);
      lastError =
        body?.message ??
        body?.error ??
        `Supabase Storage HTTP ${response.status}`;
      if (response.status !== 429 && response.status < 500) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : lastError;
    }
  }
  throw new Error(lastError);
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function invalidJsonResponseMessage(label, response, body) {
  const contentType = response.headers.get("content-type") ?? "알 수 없음";
  const fields =
    body && typeof body === "object" ? Object.keys(body).join(",") : "없음";
  return `${label} 응답 필드 누락 · HTTP ${response.status} · ${contentType} · 필드 ${fields}`;
}

async function dispatchCatalogBatch(message) {
  try {
    const { jobId, chunkCount, total } = message.payload ?? {};
    const response = await fetch(
      `/api/suppliers/${catalogProvider(message)}/products/sync/${encodeURIComponent(jobId)}/dispatch`,
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
      throw new Error(
        body?.error?.message ??
          `GitHub Actions 실행 요청 HTTP ${response.status}`,
      );
    }
    dispatchCatalogProgress(message.requestId, {
      phase: "queued",
      progress: message.progress,
      message: "수집을 마쳤습니다. GitHub Actions DB 저장을 기다리고 있습니다.",
    });
    return { ok: true, job: body.job };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "GitHub Actions 작업을 시작하지 못했습니다.",
    };
  }
}

async function gzipJson(value) {
  const source = new Blob([JSON.stringify(value)], {
    type: "application/json",
  });
  const stream = source.stream().pipeThrough(new CompressionStream("gzip"));
  return new Blob([await new Response(stream).arrayBuffer()], {
    type: "application/gzip",
  });
}

async function saveCatalogProduct(message) {
  let status = null;
  let retryable = true;
  try {
    const response = await fetch(
      `/api/suppliers/${catalogProvider(message)}/products/import`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(message.product),
        signal: AbortSignal.timeout(45_000),
      },
    );
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
      message:
        error instanceof Error
          ? error.message
          : "직감 상품 저장에 실패했습니다.",
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
  const supplierLabel = catalogSupplierLabel(message);
  if (suffix === "starting") {
    return {
      phase: "starting",
      message: `${supplierLabel} 전체 가져오기를 시작하고 있습니다.`,
    };
  }
  if (suffix === "discovery")
    return { phase: "discovering", progress: message.progress };
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
      message: `${supplierLabel} 상품을 수집 파일로 만들고 있습니다.`,
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
    return {
      phase: "item_failed",
      progress: message.progress,
      url: message.url,
      message: message.message,
    };
  }
  if (suffix === "complete")
    return { phase: "complete", summary: message.summary };
  return {
    phase: "failed",
    message:
      message.message ?? `${supplierLabel} 전체 가져오기에 실패했습니다.`,
  };
}

function dispatchCatalogProgress(requestId, detail) {
  window.dispatchEvent(
    new CustomEvent(CATALOG_PROGRESS_EVENT, {
      detail: {
        requestId,
        provider:
          detail.provider ?? catalogProviders.get(requestId) ?? "zicgam",
        ...detail,
      },
    }),
  );
}

function catalogProvider(message) {
  return message?.provider === "ebulsamchon" ? "ebulsamchon" : "zicgam";
}

function catalogSupplierLabel(message) {
  return (
    message?.supplierLabel ??
    (catalogProvider(message) === "ebulsamchon" ? "이불삼촌" : "직감")
  );
}
