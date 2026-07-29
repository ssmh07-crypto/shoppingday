import { describe, expect, it } from "vitest";
import { resolveDeliveryPolicyStoreTarget } from "@/modules/channels/naver/naver-delivery-policy";

describe("네이버 배송정책 스토어 연결", () => {
  it("명시적 대상이 없으면 기본 스토어의 정책을 선택하며 다른 스토어 정책은 거부한다", () => {
    expect(resolveDeliveryPolicyStoreTarget(null, "store-1", "store-1")).toBe(
      "store-1",
    );
    expect(
      resolveDeliveryPolicyStoreTarget("store-2", "store-1", "store-1"),
    ).toBeNull();
    expect(resolveDeliveryPolicyStoreTarget(null, null, "store-1")).toBeNull();
  });
});
