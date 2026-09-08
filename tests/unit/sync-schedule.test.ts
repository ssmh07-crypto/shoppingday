import { describe, expect, it } from "vitest";
import {
  nextSyncRun,
  syncScheduleInputSchema,
} from "@/modules/suppliers/core/sync-schedule";

describe("공급처 변경 확인 예약", () => {
  it("예약 해제 시 다음 실행을 비운다", () => {
    expect(
      nextSyncRun(new Date(), { enabled: false, intervalHours: 24 }),
    ).toBeNull();
  });
  it("자정과 월말을 넘어 설정한 간격을 유지한다", () => {
    const now = new Date("2026-09-30T23:30:00+09:00");
    expect(
      nextSyncRun(now, { enabled: true, intervalHours: 6 })?.toISOString(),
    ).toBe("2026-09-30T20:30:00.000Z");
    expect(
      nextSyncRun(now, { enabled: true, intervalHours: 24 })?.toISOString(),
    ).toBe("2026-10-01T14:30:00.000Z");
  });
  it("과도한 요청을 만드는 임의 간격과 잘못된 설정을 거부한다", () => {
    for (const intervalHours of [0, 1, 5, 6.5, 48, "6"]) {
      expect(
        syncScheduleInputSchema.safeParse({ enabled: true, intervalHours })
          .success,
      ).toBe(false);
    }
  });
});
