import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { SourcingResearchService } from "@/modules/sourcing/sourcing-service";
import { defaultSourcingSignals, type SourcingResearchRecord } from "@/modules/sourcing/types";

describe("소싱 아이템 상품 등록 초안", () => {
  it("분류된 상품명·태그와 예상 판매가를 실제 상품 초안 입력으로 전달한다", async () => {
    const createRegistrationProduct = vi.fn().mockResolvedValue({
      productId: "00000000-0000-4000-8000-000000000099",
      alreadyExists: false,
    });
    const repository = {
      find: vi.fn().mockResolvedValue(research()),
      createRegistrationProduct,
    };
    const service = new SourcingResearchService(repository as never);

    const result = await service.createRegistrationProduct(
      "00000000-0000-4000-8000-000000000010",
      "00000000-0000-4000-8000-000000000001",
    );

    expect(result.alreadyExists).toBe(false);
    expect(createRegistrationProduct).toHaveBeenCalledWith(
      "00000000-0000-4000-8000-000000000010",
      "00000000-0000-4000-8000-000000000001",
      expect.objectContaining({
        title: "미끄럼방지 욕실화",
        searchTags: ["욕실슬리퍼"],
        sellingPrice: 19_900,
        supplierPrice: 2_900,
      }),
    );
    expect(createRegistrationProduct.mock.calls[0]![2].title).not.toContain("생활용품");
  });

  it("소싱 키워드가 없는 임시 항목은 등록 상품으로 만들지 않는다", async () => {
    const repository = {
      find: vi.fn().mockResolvedValue({ ...research(), sourcingKeyword: "" }),
      createRegistrationProduct: vi.fn(),
    };
    const service = new SourcingResearchService(repository as never);

    await expect(service.createRegistrationProduct("owner", "research"))
      .rejects.toMatchObject({ code: "registration_not_ready" });
    expect(repository.createRegistrationProduct).not.toHaveBeenCalled();
  });
});

function research(): SourcingResearchRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    status: "selected",
    sourcingKeyword: "욕실화",
    monthlySearchVolume: 12_000,
    sixMonthRevenue: 200_000_000,
    marketNotes: "",
    coupangAveragePrice: 18_000,
    naverAveragePrice: 20_000,
    expectedSellingPrice: 19_900,
    maximumPurchasePrice: 13_930,
    signals: defaultSourcingSignals,
    finalSellingPoint: "",
    positiveReviews: "",
    negativeReviews: "",
    customerNeeds: "",
    productSpecs: "",
    primaryTarget: "",
    referenceNotes: "",
    relatedKeywords: [
      related("미끄럼방지욕실화", 800, "product_name"),
      related("욕실슬리퍼", 600, "tag"),
      related("생활용품", 500, "category"),
    ],
    samples: [
      { id: crypto.randomUUID(), url: "", price: 3_200, features: "" },
      { id: crypto.randomUUID(), url: "", price: 2_900, features: "" },
    ],
    registrationProductId: null,
    createdAt: new Date("2026-07-19T00:00:00.000Z"),
    updatedAt: new Date("2026-07-19T00:00:00.000Z"),
  };
}

function related(
  keyword: string,
  monthlySearchVolume: number,
  placement: "product_name" | "tag" | "category",
) {
  return {
    id: crypto.randomUUID(),
    keyword,
    normalizedKeyword: keyword.replace(/\s+/g, ""),
    monthlySearchVolume,
    placement,
    source: "itemscout-xlsx" as const,
    importedAt: "2026-07-19T00:00:00.000Z",
  };
}
