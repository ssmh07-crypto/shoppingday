import { describe, expect, it } from "vitest";
import { enabledChangeKinds, supplierChangeTargets } from "@/modules/suppliers/core/change-application-policy";
import { syncScheduleInputSchema } from "@/modules/suppliers/core/sync-schedule";

const source = { previousAvailability: "active", availability: "active", previousDescription: "<p>old</p>", description: "<p>new</p>", editedDescription: "<p>old</p>" };
describe("공급처 자동 반영 범위", () => {
  it("기존 예약의 가격 외 자동 반영은 모두 꺼진다", () => {
    expect(enabledChangeKinds(syncScheduleInputSchema.parse({ enabled: true, applyPrices: true, intervalHours: 6 }))).toEqual([]);
    expect(enabledChangeKinds({ applySoldOut: true, applyDescriptions: true })).toEqual(["sold_out", "description"]);
  });
  it("조회 실패나 판매 가능 복귀를 상태 변경으로 처리하지 않는다", () => {
    for (const availability of ["unknown", "active"]) expect(supplierChangeTargets({ ...source, availability }).map(item => item.kind)).toEqual(["description"]);
    expect(supplierChangeTargets({ ...source, availability: "discontinued" })[0]).toMatchObject({ kind: "discontinued", targetValue: "discontinued" });
  });
  it("가공한 상세와 비어 있는 수집 결과는 덮어쓰지 않는다", () => {
    expect(supplierChangeTargets({ ...source, editedDescription: "seller edit" })).toEqual([]);
    expect(supplierChangeTargets({ ...source, description: null })).toEqual([]);
    expect(supplierChangeTargets({ ...source, previousDescription: null, editedDescription: "" })).toEqual([]);
  });
});
