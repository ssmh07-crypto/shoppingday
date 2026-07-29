import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  calculateNaverBulkJobProgress,
  naverBulkRetryDelayMs,
} from "@/modules/channels/naver/naver-bulk-job-repository";

describe("네이버 대량 작업 상태", () => {
  it("전체 처리 전에는 실행 중 상태를 유지한다", () => {
    expect(calculateNaverBulkJobProgress(10, 6, 1)).toEqual({
      processed: 7,
      succeeded: 6,
      failed: 1,
      status: "running",
    });
  });

  it("완료 결과에 실패가 있으면 부분 실패로 종료한다", () => {
    expect(calculateNaverBulkJobProgress(3, 2, 1)).toEqual({
      processed: 3,
      succeeded: 2,
      failed: 1,
      status: "partial_failed",
    });
    expect(calculateNaverBulkJobProgress(3, 3, 0).status).toBe("completed");
  });

  it("재시도 간격을 지수 방식으로 늘린다", () => {
    expect(naverBulkRetryDelayMs(1)).toBe(2_000);
    expect(naverBulkRetryDelayMs(2)).toBe(4_000);
    expect(naverBulkRetryDelayMs(3)).toBe(8_000);
  });
});
