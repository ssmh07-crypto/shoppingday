/* global chrome, ShoppingdayZicgamStockParser */

void run();

async function run() {
  const response = await chrome.runtime
    .sendMessage({ type: "shoppingday.supplier.ready" })
    .catch(() => null);
  if (!response?.ok || !response.payload) return;
  const request = response.payload;
  let result;
  try {
    await waitForProductUi();
    result = ShoppingdayZicgamStockParser.inspect(
      document,
      location,
      request.url,
    );
  } catch (error) {
    result = ShoppingdayZicgamStockParser.makeResult(
      request.url,
      "failed",
      {
        evidence: [
          error instanceof Error
            ? error.message.slice(0, 300)
            : "직감 상품 상태를 확인하지 못했습니다.",
        ],
      },
    );
  }
  await chrome.runtime
    .sendMessage({ type: "shoppingday.supplier.result", result })
    .catch(() => undefined);
}

async function waitForProductUi() {
  if (document.readyState === "loading") {
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve, { once: true }),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 1_500));
}
