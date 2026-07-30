// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationNaverActions } from "@/app/admin/registration/registration-naver-actions";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  router.refresh.mockReset();
});

describe("상품등록관리 스마트스토어 빠른 작업", () => {
  it("미등록 상품의 최신 payload를 확인한 뒤 실제 등록한다", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          inspection: {
            ready: true,
            action: "create",
            payloadHash: "a".repeat(64),
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          result: { publication: { channelProductNo: "123456789" } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <RegistrationNaverActions
        productId="product-1"
        title="테스트 상품"
        editHref="/admin/products?edit=product-1"
        channelProductNo={null}
        publicationStatus={null}
        remoteStatusType={null}
        connected
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "등록" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/products/product-1/naver-publication",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          confirmed: true,
          payloadHash: "a".repeat(64),
        }),
      }),
    );
    expect(await screen.findByText("등록 완료")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("등록 상품에는 변경·품절·삭제 작업을 표시한다", () => {
    vi.stubGlobal("fetch", vi.fn());

    render(
      <RegistrationNaverActions
        productId="product-1"
        title="테스트 상품"
        editHref="/admin/products?edit=product-1"
        channelProductNo="123456789"
        publicationStatus="published"
        remoteStatusType="SALE"
        connected
      />,
    );

    expect(screen.getByRole("button", { name: "변경" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "품절" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "삭제" })).toBeInTheDocument();
  });
});
