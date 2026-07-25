import { describe, expect, it } from "vitest";
import { naverStoreSettingsInputSchema } from "@/modules/channels/naver/naver-store-settings";

describe("스마트스토어 등록 대상 설정", () => {
  it("스마트스토어와 브랜드스토어의 https 주소만 허용한다", () => {
    expect(
      naverStoreSettingsInputSchema.safeParse({
        storeName: "쇼핑데이",
        storeUrl: "https://smartstore.naver.com/shoppingday",
        accountId: "seller-account",
      }).success,
    ).toBe(true);
    expect(
      naverStoreSettingsInputSchema.safeParse({
        storeName: "쇼핑데이",
        storeUrl: "https://example.com/fake-store",
        accountId: "",
      }).success,
    ).toBe(false);
  });

  it("빈 선택 계정 ID는 null로 정규화한다", () => {
    expect(
      naverStoreSettingsInputSchema.parse({
        storeName: "쇼핑데이",
        storeUrl: "https://brand.naver.com/shoppingday",
        accountId: " ",
      }).accountId,
    ).toBeNull();
  });

  it("SELLER 연결은 판매자 ID 또는 UID를 필수로 받는다", () => {
    expect(
      naverStoreSettingsInputSchema.safeParse({
        storeName: "외부 판매자 스토어",
        storeUrl: "https://smartstore.naver.com/external-seller",
        authType: "SELLER",
        accountId: "",
        isDefault: false,
      }).success,
    ).toBe(false);
    expect(
      naverStoreSettingsInputSchema.parse({
        storeName: "외부 판매자 스토어",
        storeUrl: "https://smartstore.naver.com/external-seller",
        authType: "SELLER",
        accountId: "ncp_seller_uid",
        isDefault: false,
      }).authType,
    ).toBe("SELLER");
  });
});
