// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductBulkActions } from "@/app/admin/products/product-bulk-actions";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("상품 대량 작업", () => {
  it("현재 페이지 상품을 확인 후 큐에 넣고 완료 상태까지 갱신한다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ success: true, jobs: [] }),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            success: true,
            job: {
              id: "11111111-1111-4111-8111-111111111111",
              type: "upload_images",
              status: "queued",
              total: 2,
              processed: 0,
              succeeded: 0,
              failed: 0,
            },
          },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          waiting: false,
          job: {
            id: "11111111-1111-4111-8111-111111111111",
            type: "upload_images",
            status: "completed",
            total: 2,
            processed: 2,
            succeeded: 2,
            failed: 0,
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProductBulkActions
        productIds={[
          "22222222-2222-4222-8222-222222222222",
          "33333333-3333-4333-8333-333333333333",
        ]}
      />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole("button", { name: "현재 페이지 이미지 업로드" }),
    );

    await screen.findByText("2개 작업을 완료했습니다.");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/products/bulk-jobs",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          confirmed: true,
          type: "upload_images",
          productIds: [
            "22222222-2222-4222-8222-222222222222",
            "33333333-3333-4333-8333-333333333333",
          ],
        }),
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "이미지 · 2/2 · 성공 2 · 실패 0",
    );
  });
});
