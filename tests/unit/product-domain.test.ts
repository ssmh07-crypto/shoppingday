import { describe, expect, it } from "vitest";
import {
  draftInputSchema,
  imagesFromSupplier,
  readyErrors,
  sanitizeDescription,
  statusAfterSave,
} from "@/modules/products/product-domain";

const base = {
  draftVersion: 1,
  title: "판매 상품",
  searchTags: [" 태그 ", "태그", "둘"],
  sellingPrice: 1000,
  currency: "KRW" as const,
  description: "<p>설명</p>",
  categoryId: null,
  naverCategoryId: "50000000",
  selectedImages: imagesFromSupplier(["https://example.test/a.jpg"]),
  editedOptions: { groups: [], combinations: [] },
  naverAttributes: [],
};
describe("판매 상품 도메인", () => {
  it("상품명과 판매가를 검증한다", () => {
    expect(
      draftInputSchema.safeParse({ ...base, title: "x".repeat(201) }).success,
    ).toBe(false);
    expect(
      draftInputSchema.safeParse({ ...base, sellingPrice: 1.5 }).success,
    ).toBe(false);
    expect(
      draftInputSchema.safeParse({ ...base, sellingPrice: 0 }).success,
    ).toBe(false);
  });
  it("태그 공백과 중복을 제거하고 순서를 유지한다", () => {
    expect(draftInputSchema.parse(base).searchTags).toEqual(["태그", "둘"]);
  });
  it("태그 개수 제한을 검증한다", () => {
    expect(
      draftInputSchema.safeParse({
        ...base,
        searchTags: Array.from({ length: 21 }, (_, i) => String(i)),
      }).success,
    ).toBe(false);
  });
  it("대표 이미지와 정렬을 검증한다", () => {
    const parsed = draftInputSchema.parse({
      ...base,
      selectedImages: [{ ...base.selectedImages[0]!, sortOrder: 9 }],
    });
    expect(parsed.selectedImages[0]?.sortOrder).toBe(0);
    expect(
      readyErrors({
        ...parsed,
        selectedImages: parsed.selectedImages.map((i) => ({
          ...i,
          isPrimary: false,
        })),
      }),
    ).toHaveProperty("selectedImages");
  });
  it("활성 대표 이미지가 정확히 하나인지 검증한다", () => {
    const parsed = draftInputSchema.parse(base);
    expect(
      readyErrors({
        ...parsed,
        selectedImages: [
          ...parsed.selectedImages,
          { ...parsed.selectedImages[0]!, id: "second", isPrimary: true },
        ],
      }),
    ).toHaveProperty("selectedImages");
    expect(
      readyErrors({
        ...parsed,
        selectedImages: parsed.selectedImages.map((i) => ({
          ...i,
          enabled: false,
        })),
      }),
    ).toHaveProperty("selectedImages");
  });
  it("옵션 그룹, 중복 값, 중복 조합과 재고를 검증한다", () => {
    const options = {
      groups: [
        {
          id: "g",
          name: "",
          values: [
            { id: "a", name: "빨강", enabled: true },
            { id: "b", name: "빨강", enabled: true },
          ],
        },
      ],
      combinations: [
        {
          id: "1",
          valueIds: ["a"],
          additionalPrice: 0,
          stock: -1,
          enabled: true,
          supplierOptionReference: null,
        },
        {
          id: "2",
          valueIds: ["a"],
          additionalPrice: 0,
          stock: 0,
          enabled: true,
          supplierOptionReference: null,
        },
      ],
    };
    expect(
      draftInputSchema.safeParse({ ...base, editedOptions: options }).success,
    ).toBe(false);
  });
  it("조합이 존재하지 않는 옵션값을 참조하면 거부한다", () => {
    const options = {
      groups: [
        {
          id: "g",
          name: "색상",
          values: [{ id: "a", name: "빨강", enabled: true }],
        },
      ],
      combinations: [
        {
          id: "1",
          valueIds: ["missing"],
          additionalPrice: 0,
          stock: 0,
          enabled: true,
          supplierOptionReference: null,
        },
      ],
    };
    expect(
      draftInputSchema.safeParse({ ...base, editedOptions: options }).success,
    ).toBe(false);
  });
  it("ready 필수값과 중요 필드 수정 시 ready 해제를 검증한다", () => {
    expect(
      readyErrors({ ...draftInputSchema.parse(base), title: "" }),
    ).toHaveProperty("title");
    expect(
      readyErrors({ ...draftInputSchema.parse(base), naverCategoryId: null }),
    ).toHaveProperty("naverCategoryId");
    expect(statusAfterSave("ready", ["title"])).toBe("editing");
    expect(statusAfterSave("ready", ["naverCategoryId"])).toBe("editing");
    expect(statusAfterSave("ready", ["naverAttributes"])).toBe("editing");
    expect(statusAfterSave("ready", ["searchTags"])).toBe("ready");
  });
  it("네이버 속성값의 중복과 빈 직접 입력을 거부한다", () => {
    const attribute = {
      attributeSeq: 10,
      attributeValueSeq: 100,
      minValue: "빨강",
      maxValue: "",
      unitCode: null,
    };
    expect(
      draftInputSchema.safeParse({
        ...base,
        naverAttributes: [attribute, attribute],
      }).success,
    ).toBe(false);
    expect(
      draftInputSchema.safeParse({
        ...base,
        naverAttributes: [
          {
            ...attribute,
            attributeValueSeq: null,
            minValue: "",
          },
        ],
      }).success,
    ).toBe(false);
  });
  it("위험 HTML과 URL을 제거한다", () => {
    const clean = sanitizeDescription(
      '<script>x</script><a href="javascript:alert(1)" onclick="x()">a</a><img src="data:x">',
    );
    expect(clean).not.toMatch(/script|javascript|onclick|data:/);
  });
});
