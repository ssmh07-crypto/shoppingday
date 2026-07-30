/* global chrome */

const REQUEST_EVENT = "shoppingday:rank-extension-request";
const RESULT_EVENT = "shoppingday:rank-extension-result";
const STATUS_EVENT = "shoppingday:rank-extension-status";
const PING_EVENT = "shoppingday:rank-extension-ping";
const SUPPLIER_REQUEST_EVENT = "shoppingday:supplier-check-request";
const SUPPLIER_RESULT_EVENT = "shoppingday:supplier-check-result";

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

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "shoppingday.rank.result") {
    dispatchResult(message.requestId, message.result);
  }
  if (message?.type === "shoppingday.supplier.result") {
    dispatchSupplierResult(message.requestId, message.result);
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
