import type { ProductRow } from "@/lib/db/schema";
import {
  draftInputSchema,
  imagesFromSupplier,
  optionsFromSupplier,
  readyErrors,
  statusAfterSave,
  titleInputSchema,
  type DraftInput,
} from "./product-domain";
import {
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from "./product-errors";
import type { ProductEditRepository } from "./product-edit-repository";

export class ProductEditService {
  constructor(private repo: ProductEditRepository) {}
  list(
    ownerId: string,
    input: {
      search?: string;
      filter?: string;
      sort?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    const pageSize = [30, 50, 100].includes(input.pageSize ?? 0)
      ? input.pageSize!
      : 30;
    return this.repo.list({
      ownerId,
      ...input,
      page: Math.max(1, input.page ?? 1),
      pageSize,
    });
  }
  async get(id: string, ownerId: string) {
    const row = await this.repo.find(id, ownerId);
    if (!row) throw new ProductNotFoundError();
    return row;
  }
  categories() {
    return this.repo.categories();
  }
  async saveDraft(id: string, ownerId: string, raw: unknown) {
    const input = draftInputSchema.parse(raw);
    const current = await this.get(id, ownerId);
    const changed = changedFields(current.product, input);
    const status = statusAfterSave(current.product.status, changed);
    return this.handle(
      await this.repo.save(
        id,
        ownerId,
        input,
        status,
        changed,
        "product_draft_saved",
        {},
        status === "ready" ? current.product.readyAt : null,
      ),
    );
  }
  async saveTitle(id: string, ownerId: string, raw: unknown) {
    const { draftVersion, title } = titleInputSchema.parse(raw);
    const current = await this.get(id, ownerId);
    if (current.product.draftVersion !== draftVersion)
      throw new ProductConflictError();
    const input: DraftInput = {
      draftVersion,
      title,
      searchTags: current.product.searchTags,
      sellingPrice: current.product.sellingPrice,
      currency: current.product.currency as "KRW",
      description: current.product.description,
      categoryId: current.product.categoryId,
      naverCategoryId: current.product.naverCategoryId,
      selectedImages: current.product.selectedImages,
      editedOptions: current.product.editedOptions,
    };
    const status = statusAfterSave(current.product.status, ["title"]);
    return this.handle(
      await this.repo.save(
        id,
        ownerId,
        input,
        status,
        ["title"],
        "product_title_saved",
        {},
        status === "ready" ? current.product.readyAt : null,
      ),
    );
  }
  async markReady(id: string, ownerId: string, raw: unknown) {
    const input = draftInputSchema.parse(raw);
    const errors = readyErrors(input);
    if (Object.keys(errors).length) throw new ProductValidationError(errors);
    const current = await this.get(id, ownerId);
    return this.handle(
      await this.repo.save(
        id,
        ownerId,
        input,
        "ready",
        changedFields(current.product, input),
        "product_marked_ready",
        {},
        new Date(),
      ),
    );
  }
  async revert(id: string, ownerId: string, raw: unknown) {
    const input = draftInputSchema.parse(raw);
    const current = await this.get(id, ownerId);
    return this.handle(
      await this.repo.save(
        id,
        ownerId,
        input,
        "draft",
        changedFields(current.product, input),
        "product_reverted_to_draft",
        {},
        null,
      ),
    );
  }
  async reset(
    id: string,
    ownerId: string,
    version: number,
    kind: "images" | "options",
  ) {
    const current = await this.get(id, ownerId);
    const value =
      kind === "images"
        ? imagesFromSupplier(current.supplier.originalImages)
        : optionsFromSupplier(current.supplier.originalOptions);
    return this.handle(
      await this.repo.reset(id, ownerId, version, kind, value),
    );
  }
  private handle<T extends { kind: string }>(result: T) {
    if (result.kind === "conflict") throw new ProductConflictError();
    if (result.kind === "not_found") throw new ProductNotFoundError();
    if (result.kind === "invalid_naver_category")
      throw new ProductValidationError({
        naverCategoryId: "동기화된 네이버 최종 카테고리를 선택해 주세요.",
      });
    return result;
  }
}
function changedFields(
  product: Pick<ProductRow, keyof DraftInput>,
  input: DraftInput,
) {
  return (
    [
      "title",
      "searchTags",
      "sellingPrice",
      "currency",
      "description",
      "categoryId",
      "naverCategoryId",
      "selectedImages",
      "editedOptions",
    ] as const
  ).filter(
    (key) => JSON.stringify(product[key]) !== JSON.stringify(input[key]),
  );
}
