import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NaverCategoryMetadataService } from "@/modules/channels/naver/naver-category-metadata";
import type { NaverCategoriesClient } from "@/modules/channels/naver/naver-commerce-relay";

function client() {
  return {
    fetchCategories: vi.fn(),
    fetchProductModels: vi.fn(),
    fetchProductAttributes: vi.fn().mockResolvedValue([
      {
        attributeSeq: 1,
        attributeName: "색상",
        attributeType: "PRIMARY" as const,
      },
      {
        attributeSeq: 2,
        attributeName: "소재",
        attributeType: "OPTIONAL" as const,
      },
    ]),
    fetchProductAttributeValues: vi.fn().mockResolvedValue([
      {
        attributeSeq: 1,
        attributeValueSeq: 11,
        minAttributeValue: "빨강",
        exposureOrder: 1,
      },
    ]),
    fetchProductAttributeUnits: vi
      .fn()
      .mockResolvedValue([{ id: "A02036", unitCodeName: "cm" }]),
    fetchStandardOptions: vi.fn().mockResolvedValue({
      useStandardOption: true,
      standardOptionCategoryGroups: [
        {
          attributeName: "색상",
          imageRegistrationUsable: true,
          realValueUsable: false,
          optionSetRequired: true,
        },
      ],
    }),
  };
}

describe("네이버 카테고리 필수정보", () => {
  beforeEach(() => vi.clearAllMocks());

  it("속성과 표준 옵션을 병렬 조회해 필수 항목을 요약하고 캐시한다", async () => {
    const api = client();
    const service = new NaverCategoryMetadataService(
      api as unknown as NaverCategoriesClient,
      () => 1_000,
    );

    const first = await service.get("59990001");
    const second = await service.get("59990001");

    expect(first.requiredAttributes.map((item) => item.attributeName)).toEqual([
      "색상",
    ]);
    expect(first.requiredOptionGroups).toHaveLength(1);
    expect(first.attributeValues).toHaveLength(1);
    expect(first.units).toEqual([{ id: "A02036", unitCodeName: "cm" }]);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(api.fetchProductAttributes).toHaveBeenCalledTimes(1);
    expect(api.fetchStandardOptions).toHaveBeenCalledTimes(1);
  });
});
