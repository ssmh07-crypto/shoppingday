// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductBulkActions } from "@/app/admin/products/product-bulk-actions";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("상품 대량 작업", () => {
  it("화면 재진입 후에도 진행 작업을 자동 조회하고 완료를 표시한다", async () => {
    vi.useFakeTimers();
    const job = { id: "restored", type: "publish", status: "running", total: 2, processed: 1, succeeded: 1, failed: 0 };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ jobs: [job] })).mockResolvedValueOnce(Response.json({ jobs: [{ ...job, status: "completed", processed: 2, succeeded: 2 }] }));
    vi.stubGlobal("fetch", fetchMock);
    await act(async () => { render(<ProductBulkActions productIds={[]} />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(screen.getByRole("status")).toHaveTextContent("2/2");
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(call => call[1].method === undefined)).toBe(true);
  });
  it("서버 실행 선택 시 화면의 다음 상품 실행 요청 없이 서버에 접수한다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const job = { id: "server-job", type: "publish", status: "queued", total: 1, processed: 0, succeeded: 0, failed: 0 };
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ jobs: [] })).mockResolvedValueOnce(Response.json({ job })).mockResolvedValueOnce(Response.json({ success: true, job }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProductBulkActions productIds={["one"]} />);
    const start = screen.getByRole("button", { name: "선택 상품 스마트스토어 등록" });
    await waitFor(() => expect(start).toBeEnabled());
    fireEvent.click(screen.getByLabelText("화면을 닫아도 서버에서 처리"));
    fireEvent.click(start);
    await screen.findByText("서버 실행을 접수했습니다. 화면을 닫아도 이어서 처리합니다. 네이버 릴레이 PC는 켜 두세요.");
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/products/bulk-jobs/server-job/background", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("선택이 없으면 등록 요청을 보내지 않는다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ jobs: [] }));
    vi.stubGlobal("fetch", fetchMock);
    render(<ProductBulkActions productIds={[]} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole("button", { name: "선택 상품 스마트스토어 등록" }),
    ).toBeDisabled();
  });

  it("최신 완료 작업보다 이전 진행 중 작업을 우선 복구한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          jobs: [
            {
              id: "new",
              type: "publish",
              status: "completed",
              processed: 1,
              total: 1,
              succeeded: 1,
              failed: 0,
            },
            {
              id: "active",
              type: "upload_images",
              status: "running",
              processed: 3,
              total: 10,
              succeeded: 3,
              failed: 0,
            },
          ],
        }),
      ),
    );
    render(<ProductBulkActions productIds={["one"]} />);
    await screen.findByRole("button", { name: "작업 계속" });
    expect(screen.getByRole("status")).toHaveTextContent("이미지 · 3/10");
    expect(
      screen.getByRole("button", { name: "선택 상품 스마트스토어 등록" }),
    ).toBeDisabled();
  });

  it("작업 생성 중 중복 클릭을 막고 연결 실패를 안내한다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    let rejectRequest: (error: Error) => void = () => undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ jobs: [] }))
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectRequest = reject;
          }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<ProductBulkActions productIds={["one"]} />);
    const button = screen.getByRole("button", {
      name: "선택 상품 스마트스토어 등록",
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(button).toBeDisabled();
    rejectRequest(new Error("offline"));
    await screen.findByText(
      "연결이 끊겼습니다. 새로고침해 기존 작업을 확인한 뒤 계속하세요.",
    );
  });

  it("선택 상품을 확인 후 큐에 넣고 완료 상태까지 갱신한다", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ success: true, jobs: [] }))
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
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "선택 상품 이미지 업로드" }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "선택 상품 이미지 업로드" }),
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
