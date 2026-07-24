import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CommerceApiManagedProductImporter } from "@/modules/keywords/naver-product-importer";

describe("네이버 관리 상품 정보 가져오기", () => {
  it("등록 카테고리·속성·판매자 태그를 사람이 확인할 수 있는 값으로 변환한다", async () => {
    const client = {
      fetchChannelProduct: vi.fn().mockResolvedValue({
        originProduct: {
          leafCategoryId: "50000805",
          name: "린넨 여름 원피스",
          detailAttribute: {
            productAttributes: [
              { attributeSeq: 10, attributeValueSeq: 100 },
              { attributeSeq: 20, attributeRealValue: "95", attributeRealValueUnitCode: "cm" },
            ],
            seoInfo: {
              sellerTags: [
                { code: 1, text: "여름원피스" },
                { code: 2, text: "여름원피스" },
              ],
            },
          },
        },
      }),
      fetchProductAttributes: vi.fn().mockResolvedValue([
        { attributeSeq: 10, attributeName: "소재" },
        { attributeSeq: 20, attributeName: "사이즈" },
      ]),
      fetchProductAttributeValues: vi.fn().mockResolvedValue([
        { attributeSeq: 10, attributeValueSeq: 100, minAttributeValue: "린넨" },
      ]),
    };
    const categories = {
      findLeafByIds: vi.fn().mockResolvedValue([
        {
          id: "50000805",
          name: "원피스",
          wholeCategoryName: "패션의류>여성의류>원피스",
          last: true,
        },
      ]),
    };
    const importer = new CommerceApiManagedProductImporter(
      client as never,
      categories as never,
    );

    await expect(importer.import("1234567890")).resolves.toMatchObject({
      currentTitle: "린넨 여름 원피스",
      categoryId: "50000805",
      category: "패션의류>여성의류>원피스",
      materials: ["린넨"],
      sizes: ["95cm"],
      searchTags: ["여름원피스"],
      attributes: [
        expect.objectContaining({ attributeName: "소재", value: "린넨" }),
        expect.objectContaining({ attributeName: "사이즈", value: "95cm" }),
      ],
    });
  });
});
