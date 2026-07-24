import { describe, expect, it } from "vitest";
import {
  emptyNaverPublicationPolicy,
  mergeNaverPublicationPolicy,
  naverPublicationPolicyOverridesSchema,
  parseNaverPublicationPolicy,
} from "@/modules/channels/naver/naver-publication-policy";

describe("네이버 판매 정책", () => {
  it("저장값이 없으면 임의 발행 기본값 대신 미입력 정책을 반환한다", () => {
    expect(parseNaverPublicationPolicy(undefined)).toEqual(
      emptyNaverPublicationPolicy,
    );
  });

  it("상품별 값만 기본 정책 위에 덮어쓴다", () => {
    const defaults = {
      ...emptyNaverPublicationPolicy,
      singleStockQuantity: 20,
      taxType: "TAX" as const,
      minorPurchasable: true,
      naverShoppingRegistration: true,
      channelProductDisplayStatusType: "ON" as const,
    };

    expect(
      mergeNaverPublicationPolicy(defaults, {
        singleStockQuantity: 3,
        minorPurchasable: false,
      }),
    ).toEqual({
      ...defaults,
      singleStockQuantity: 3,
      minorPurchasable: false,
    });
  });

  it("빈 덮어쓰기는 기본 정책을 그대로 사용한다", () => {
    const defaults = {
      ...emptyNaverPublicationPolicy,
      taxType: "SMALL" as const,
    };
    expect(mergeNaverPublicationPolicy(defaults, {})).toEqual(defaults);
  });

  it("허용 범위를 벗어난 재고와 알 수 없는 정책값을 거부한다", () => {
    expect(() =>
      naverPublicationPolicyOverridesSchema.parse({
        singleStockQuantity: -1,
        taxType: "UNKNOWN",
      }),
    ).toThrow();
  });
});
