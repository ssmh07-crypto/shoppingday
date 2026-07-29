import { describe, expect, it, vi } from "vitest";
import { ProductEditService } from "@/modules/products/product-edit-service";
import { imagesFromSupplier } from "@/modules/products/product-domain";
import type {
  ProductEditRepository,
  ProductEditorRecord,
} from "@/modules/products/product-edit-repository";

const product = {
  id: "p1",
  ownerId: "u1",
  status: "draft" as const,
  title: "원본",
  searchTags: [],
  sellingPrice: null,
  currency: "KRW",
  description: "설명",
  categoryId: null,
  naverCategoryId: "50000000",
  selectedImages: imagesFromSupplier(["https://example.test/a.jpg"]),
  editedOptions: { groups: [], combinations: [] },
  naverAttributes: [],
  draftVersion: 1,
  validationErrors: {},
  readyAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
const record: ProductEditorRecord = {
  product,
  naverCategory: {
    id: "50000000",
    name: "소분류",
    wholeCategoryName: "대분류>중분류>소분류",
  },
  supplier: {
    name: "친구도매",
    externalProductId: "1",
    originalName: "원본",
    supplierPrice: "100",
    currency: "KRW",
    availability: "active",
    originalImages: ["https://example.test/a.jpg"],
    originalOptions: [],
    lastSyncedAt: new Date(),
  },
};
const draft = {
  draftVersion: 1,
  title: "판매명",
  searchTags: [" 태그 ", "태그"],
  sellingPrice: 1000,
  currency: "KRW",
  description: "<p>설명</p>",
  categoryId: null,
  naverCategoryId: "50000000",
  selectedImages: product.selectedImages,
  editedOptions: product.editedOptions,
  naverAttributes: product.naverAttributes,
};
function setup(
  result: unknown = {
    kind: "ok",
    product: { ...product, draftVersion: 2, status: "editing" },
  },
  requirements?: {
    get(categoryId: string): Promise<{
      requiredAttributes: Array<{
        attributeSeq: number;
        attributeName: string;
      }>;
      attributeValues: Array<{
        attributeSeq: number;
        attributeValueSeq: number;
      }>;
    }>;
  },
) {
  const repo = {
    find: vi.fn(async () => record),
    save: vi.fn(async () => result),
    list: vi.fn(),
    categories: vi.fn(),
    reset: vi.fn(),
  };
  return {
    service: new ProductEditService(
      repo as unknown as ProductEditRepository,
      requirements,
    ),
    repo,
  };
}
describe("상품 편집 서비스", () => {
  it("임시저장 시 정규화하고 버전 증가 결과를 반환하며 원본을 변경하지 않는다", async () => {
    const { service, repo } = setup();
    const original = structuredClone(record.supplier);
    const result = await service.saveDraft("p1", "u1", draft);
    expect(repo.save).toHaveBeenCalledWith(
      "p1",
      "u1",
      expect.objectContaining({ searchTags: ["태그"] }),
      "editing",
      expect.any(Array),
      "product_draft_saved",
      {},
      null,
    );
    expect(result).toMatchObject({ product: { draftVersion: 2 } });
    expect(record.supplier).toEqual(original);
  });
  it("낙관적 잠금 충돌을 사용자 오류로 변환한다", async () => {
    const { service } = setup({ kind: "conflict" });
    await expect(service.saveDraft("p1", "u1", draft)).rejects.toMatchObject({
      code: "product_conflict",
    });
  });
  it("목록 인라인 편집은 상품명만 변경하고 기존 편집값을 보존한다", async () => {
    const { service, repo } = setup();

    await service.saveTitle("p1", "u1", {
      draftVersion: 1,
      title: "목록에서 변경한 상품명",
    });

    expect(repo.save).toHaveBeenCalledWith(
      "p1",
      "u1",
      expect.objectContaining({
        title: "목록에서 변경한 상품명",
        description: product.description,
        naverCategoryId: product.naverCategoryId,
        selectedImages: product.selectedImages,
        editedOptions: product.editedOptions,
      }),
      "editing",
      ["title"],
      "product_title_saved",
      {},
      null,
    );
  });
  it("최종 카테고리가 아니면 사용자 입력 오류로 변환한다", async () => {
    const { service } = setup({ kind: "invalid_naver_category" });
    await expect(service.saveDraft("p1", "u1", draft)).rejects.toMatchObject({
      code: "product_validation",
      errors: { naverCategoryId: expect.any(String) },
    });
  });
  it("소싱 등록 상품명은 서버 저장에서도 50자를 넘길 수 없다", async () => {
    const { service, repo } = setup();
    repo.find.mockResolvedValue({
      ...record,
      supplier: { ...record.supplier, code: "sourcing" },
    });

    await expect(
      service.saveDraft("p1", "u1", {
        ...draft,
        title: "가".repeat(51),
      }),
    ).rejects.toMatchObject({
      code: "product_validation",
      errors: { title: expect.stringContaining("50자") },
    });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("필수값이 없으면 ready 저장을 호출하지 않는다", async () => {
    const { service, repo } = setup();
    await expect(
      service.markReady("p1", "u1", { ...draft, title: "" }),
    ).rejects.toMatchObject({ code: "product_validation" });
    expect(repo.save).not.toHaveBeenCalled();
  });
  it("카테고리를 바꾸면 이전 네이버 속성값을 제거한다", async () => {
    const { service, repo } = setup();
    await service.saveDraft("p1", "u1", {
      ...draft,
      naverCategoryId: "50000001",
      naverAttributes: [
        {
          attributeSeq: 10,
          attributeValueSeq: 100,
          minValue: "빨강",
          maxValue: "",
          unitCode: null,
        },
      ],
    });
    expect(repo.save).toHaveBeenCalledWith(
      "p1",
      "u1",
      expect.objectContaining({ naverAttributes: [] }),
      expect.any(String),
      expect.any(Array),
      expect.any(String),
      {},
      null,
    );
  });
  it("필수 네이버 속성이 빠지면 등록 준비를 거부한다", async () => {
    const requirements = {
      get: vi.fn().mockResolvedValue({
        requiredAttributes: [{ attributeSeq: 10, attributeName: "색상" }],
        attributeValues: [{ attributeSeq: 10, attributeValueSeq: 100 }],
      }),
    };
    const { service, repo } = setup(undefined, requirements);
    const selection = {
      attributeSeq: 10,
      attributeValueSeq: 999,
      minValue: "오래된 값",
      maxValue: "",
      unitCode: null,
    };
    await expect(
      service.markReady("p1", "u1", {
        ...draft,
        naverAttributes: [selection],
      }),
    ).rejects.toMatchObject({
      code: "product_validation",
      errors: { naverAttributes: expect.stringContaining("색상") },
    });
    expect(repo.save).not.toHaveBeenCalled();
    await service.markReady("p1", "u1", {
      ...draft,
      naverAttributes: [{ ...selection, attributeValueSeq: 100 }],
    });
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
  it("ready 검증 성공 시 ready 상태와 감사 action을 저장 계층에 전달한다", async () => {
    const { service, repo } = setup({
      kind: "ok",
      product: { ...product, status: "ready", draftVersion: 2 },
    });
    await service.markReady("p1", "u1", draft);
    expect(repo.save).toHaveBeenCalledWith(
      "p1",
      "u1",
      expect.any(Object),
      "ready",
      expect.any(Array),
      "product_marked_ready",
      {},
      expect.any(Date),
    );
  });
});
