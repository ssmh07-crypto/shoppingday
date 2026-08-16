// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("Shoppingday Chrome extension bridge", () => {
  it("returns a useful failure result when the extension context was invalidated", async () => {
    const sendMessage = vi.fn((message: { type?: string }) => {
      if (message.type === "shoppingday.rank.ping") {
        return Promise.resolve({ ok: true, version: "0.5.9" });
      }
      throw new Error("Extension context invalidated.");
    });
    const chromeMock = {
      runtime: {
        id: "test-extension",
        sendMessage,
        onMessage: { addListener: vi.fn() },
      },
    };
    const source = readFileSync(
      resolve(process.cwd(), "chrome-extension/shoppingday-bridge.js"),
      "utf8",
    );
    Function("chrome", source)(chromeMock);

    let result: Record<string, unknown> | undefined;
    window.addEventListener(
      "shoppingday:keyword-exposure-result",
      ((event: CustomEvent) => {
        result = event.detail.result;
      }) as EventListener,
      { once: true },
    );

    window.dispatchEvent(
      new CustomEvent("shoppingday:keyword-exposure-request", {
        detail: { requestId: "request-1", keyword: "짤순이" },
      }),
    );

    await vi.waitFor(() => expect(result).toBeDefined());
    expect(result).toMatchObject({
      keyword: "짤순이",
      status: "failed",
      categoryDistribution: [],
      message:
        "Chrome 확장 프로그램이 업데이트되었습니다. 확장 프로그램을 다시 불러온 뒤 Shoppingday 페이지를 새로고침해 주세요.",
    });
  });

  it("forwards Smartstore review requests and results through page events", async () => {
    let runtimeListener: ((message: unknown) => void) | undefined;
    const sendMessage = vi.fn(() => Promise.resolve({ ok: true, version: "0.5.15" }));
    const chromeMock = {
      runtime: {
        id: "test-extension",
        sendMessage,
        onMessage: {
          addListener: vi.fn((listener: (message: unknown) => void) => {
            runtimeListener = listener;
          }),
        },
      },
    };
    const source = readFileSync(
      resolve(process.cwd(), "chrome-extension/shoppingday-bridge.js"),
      "utf8",
    );
    Function("chrome", source)(chromeMock);

    window.dispatchEvent(new CustomEvent("shoppingday:smartstore-review-request", {
      detail: {
        requestId: "review-request-1",
        url: "https://smartstore.naver.com/sample/products/123",
      },
    }));
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith({
      type: "shoppingday.smartstore-review.request",
      payload: {
        requestId: "review-request-1",
        url: "https://smartstore.naver.com/sample/products/123",
      },
    }));

    let received: CustomEvent | undefined;
    window.addEventListener("shoppingday:smartstore-review-result", ((event: CustomEvent) => {
      received = event;
    }) as EventListener, { once: true });
    runtimeListener?.({
      type: "shoppingday.smartstore-review.result",
      requestId: "review-request-1",
      result: { status: "completed", reviews: [{ content: "좋아요", rating: 5 }] },
    });

    expect(received?.detail).toMatchObject({
      requestId: "review-request-1",
      result: { status: "completed", reviews: [{ content: "좋아요", rating: 5 }] },
    });
  });
});
