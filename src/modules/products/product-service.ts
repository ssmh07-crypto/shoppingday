import { randomUUID } from "node:crypto";
import type { ApiCallLogRepository } from "@/modules/audit/api-call-log-repository";
import { logger } from "@/lib/logging/logger";
import type { SupplierAdapter } from "@/modules/suppliers/core/supplier-adapter";
import { SupplierError } from "@/modules/suppliers/core/supplier-errors";
import type {
  ProductRepository,
  SupplierEditableField,
} from "./product-repository";
import { supplierProductChanged } from "./product-domain";
import type { SupplierProductsQuery } from "@/modules/suppliers/core/types";

export interface ImportProductResult {
  success: true;
  productId: string;
  supplierProductId: string;
  alreadyExists: boolean;
  preview: ImportProductPreview;
}

export interface ImportAllProductsResult {
  success: true;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
}

export interface ImportAllProductsProgress extends ImportAllProductsResult {
  processed: number;
}

export interface SyncProductsResult {
  success: true;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
}

export interface SyncProductsProgress extends SyncProductsResult {
  processed: number;
}

export class ProductImportError extends Error {
  readonly code = "database_error";
  constructor() {
    super("상품 저장 중 오류가 발생했습니다.");
    this.name = "ProductImportError";
  }
}

const DAILY_API_LIMIT = 5;

export interface ImportProductPreview {
  externalProductId: string;
  originalName: string | null;
  supplierPrice: string | null;
  currency: string;
  availability: string;
  imageUrl: string | null;
  imageCount: number;
  optionCount: number;
  supplierUpdatedAt: string | null;
}

export class ProductImportService {
  constructor(
    private readonly products: ProductRepository,
    private readonly logs: ApiCallLogRepository,
    private readonly supplier: SupplierAdapter,
  ) {}

  async importByExternalId(
    goodsno: string,
    actorId: string,
  ): Promise<ImportProductResult> {
    const existing = await this.products.findImported(
      this.supplier.code,
      goodsno,
    );
    if (existing) {
      return {
        success: true,
        productId: existing.productId,
        supplierProductId: existing.supplierProductId,
        alreadyExists: true,
        preview: toPreview(existing.supplierProduct),
      };
    }

    await this.assertDailyLimit();
    return this.fetchAndSave(goodsno, null, actorId);
  }

  async refreshByExternalId(
    goodsno: string,
    actorId: string,
  ): Promise<ImportProductResult> {
    const existing = await this.products.findImported(
      this.supplier.code,
      goodsno,
    );
    if (!existing) {
      throw new SupplierError(
        "supplier_product_not_found",
        "먼저 상품을 가져와 주세요.",
      );
    }
    await this.assertDailyLimit();
    return this.fetchAndSave(goodsno, existing, actorId);
  }

  async importAll(
    actorId: string,
    onProgress?: (progress: ImportAllProductsProgress) => void | Promise<void>,
    protectedFields?: SupplierEditableField[],
  ): Promise<ImportAllProductsResult> {
    await this.assertDailyLimit();
    const requestId = randomUUID();
    const requestedAt = new Date();
    const started = performance.now();
    let responseStatus: number | null = null;
    let responseCount: number | null = null;
    try {
      const fetched = await this.supplier.fetchProducts();
      const existing = new Map(
        (await this.products.listImported(this.supplier.code)).map((record) => [
          record.supplierProduct.externalProductId,
          record,
        ]),
      );
      responseStatus = fetched.responseStatus;
      responseCount = fetched.products.length;
      let created = 0;
      let updated = 0;
      let unchanged = 0;
      let processed = 0;
      for (const product of fetched.products) {
        const current = existing.get(product.externalProductId);
        if (!current) {
          await this.products.importSupplierProduct(product, actorId);
          created += 1;
        } else if (supplierProductChanged(current.supplierProduct, product)) {
          await (protectedFields
            ? this.products.updateSupplierProduct(
                current.supplierProductId,
                product,
                current,
                { protectedFields },
              )
            : this.products.updateSupplierProduct(
                current.supplierProductId,
                product,
                current,
              ));
          updated += 1;
        } else {
          unchanged += 1;
        }
        processed += 1;
        if (processed % 100 === 0 || processed === fetched.products.length) {
          await onProgress?.({
            success: true,
            total: fetched.products.length,
            processed,
            created,
            updated,
            unchanged,
          });
        }
      }
      await this.saveLog({
        requestId,
        requestType: "product_import_all",
        goodsno: "all",
        requestedAt,
        started,
        success: true,
        responseStatus,
        responseCount,
      });
      return {
        success: true,
        total: fetched.products.length,
        created,
        updated,
        unchanged,
      };
    } catch (error) {
      const code =
        error instanceof SupplierError ? error.code : "database_error";
      if (error instanceof SupplierError) responseStatus = error.responseStatus;
      await this.saveLog({
        requestId,
        requestType: "product_import_all",
        goodsno: "all",
        requestedAt,
        started,
        success: false,
        responseStatus,
        responseCount,
        errorCode: code,
        errorMessage:
          error instanceof SupplierError
            ? error.message
            : "전체 상품 저장 중 오류가 발생했습니다.",
      });
      if (error instanceof SupplierError) throw error;
      throw new ProductImportError();
    }
  }

  async syncChanges(
    actorId: string,
    dates: { from: string; to: string },
    onProgress?: (progress: SyncProductsProgress) => void | Promise<void>,
    protectedFields?: SupplierEditableField[],
  ): Promise<SyncProductsResult> {
    await this.assertDailyLimit(2);
    const opened = await this.fetchProductsForSync(
      { opened: dates },
      "product_sync_opened",
    );
    const modified = await this.fetchProductsForSync(
      { modified: dates },
      "product_sync_modified",
    );
    const incoming = new Map(
      [...opened.products, ...modified.products].map((product) => [
        product.externalProductId,
        product,
      ]),
    );
    const existing = new Map(
      (await this.products.listImported(this.supplier.code)).map((record) => [
        record.supplierProduct.externalProductId,
        record,
      ]),
    );

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    let processed = 0;
    for (const product of incoming.values()) {
      const current = existing.get(product.externalProductId);
      if (!current) {
        await this.products.importSupplierProduct(product, actorId);
        created += 1;
      } else if (supplierProductChanged(current.supplierProduct, product)) {
        await (protectedFields
          ? this.products.updateSupplierProduct(
              current.supplierProductId,
              product,
              current,
              { protectedFields },
            )
          : this.products.updateSupplierProduct(
              current.supplierProductId,
              product,
              current,
            ));
        updated += 1;
      } else {
        unchanged += 1;
      }
      processed += 1;
      if (processed % 25 === 0 || processed === incoming.size) {
        await onProgress?.({
          success: true,
          total: incoming.size,
          processed,
          created,
          updated,
          unchanged,
        });
      }
    }

    return {
      success: true,
      total: incoming.size,
      created,
      updated,
      unchanged,
    };
  }

  private async assertDailyLimit(requiredCalls = 1) {
    const used = await this.logs.countSince(
      this.supplier.code,
      startOfTodayInKorea(),
    );
    if (used + requiredCalls > DAILY_API_LIMIT) {
      throw new SupplierError(
        "supplier_rate_limit",
        "오늘 사용할 수 있는 공급사 API 5회를 모두 사용했습니다.",
      );
    }
  }

  private async fetchProductsForSync(
    query: SupplierProductsQuery,
    requestType: "product_sync_opened" | "product_sync_modified",
  ) {
    const requestId = randomUUID();
    const requestedAt = new Date();
    const started = performance.now();
    try {
      const fetched = await this.supplier.fetchProducts(query);
      await this.saveLog({
        requestId,
        requestType,
        goodsno: "all",
        requestedAt,
        started,
        success: true,
        responseStatus: fetched.responseStatus,
        responseCount: fetched.products.length,
        parameters: syncParameters(query),
      });
      return fetched;
    } catch (error) {
      await this.saveLog({
        requestId,
        requestType,
        goodsno: "all",
        requestedAt,
        started,
        success: false,
        responseStatus:
          error instanceof SupplierError ? error.responseStatus : null,
        responseCount: null,
        errorCode:
          error instanceof SupplierError ? error.code : "database_error",
        errorMessage:
          error instanceof SupplierError
            ? error.message
            : "변경 상품 조회 중 오류가 발생했습니다.",
        parameters: syncParameters(query),
      });
      throw error;
    }
  }

  private async fetchAndSave(
    goodsno: string,
    existing: Awaited<ReturnType<ProductRepository["findImported"]>>,
    actorId: string,
  ): Promise<ImportProductResult> {
    const requestId = randomUUID();
    const requestedAt = new Date();
    const started = performance.now();
    let responseStatus: number | null = null;
    let responseCount: number | null = null;

    try {
      const fetched = await this.supplier.fetchProduct(goodsno);
      responseStatus = fetched.responseStatus;
      responseCount = fetched.products.length;
      const exact = fetched.products[0];
      if (!exact)
        throw new SupplierError(
          "supplier_product_not_found",
          "상품을 찾지 못했습니다.",
        );

      // The unique constraint is the final guard against concurrent imports.
      const saved = existing
        ? await this.products.updateSupplierProduct(
            existing.supplierProductId,
            exact,
            existing,
          )
        : await this.products.importSupplierProduct(exact, actorId);
      await this.saveLog({
        requestId,
        requestType: existing ? "product_refresh" : "product_import",
        goodsno,
        requestedAt,
        started,
        success: true,
        responseStatus,
        responseCount,
      });
      logger.info("supplier_api_call_completed", {
        requestId,
        supplierCode: this.supplier.code,
        requestType: existing ? "product_refresh" : "product_import",
        goodsno,
        durationMs: Math.round(performance.now() - started),
        success: true,
      });
      return {
        success: true,
        productId: saved.productId,
        supplierProductId: saved.supplierProductId,
        alreadyExists: Boolean(existing),
        preview: toPreview(saved.supplierProduct),
      };
    } catch (error) {
      const code =
        error instanceof SupplierError ? error.code : "database_error";
      if (error instanceof SupplierError) responseStatus = error.responseStatus;
      await this.saveLog({
        requestId,
        requestType: existing ? "product_refresh" : "product_import",
        goodsno,
        requestedAt,
        started,
        success: false,
        responseStatus,
        responseCount,
        errorCode: code,
        errorMessage:
          error instanceof SupplierError
            ? error.message
            : "상품 저장 중 오류가 발생했습니다.",
      });
      logger.error("supplier_api_call_failed", {
        requestId,
        supplierCode: this.supplier.code,
        requestType: "product_import",
        goodsno,
        durationMs: Math.round(performance.now() - started),
        success: false,
        errorCode: code,
      });
      if (error instanceof SupplierError) throw error;
      throw new ProductImportError();
    }
  }

  private async saveLog(input: {
    requestId: string;
    requestType:
      | "product_import"
      | "product_refresh"
      | "product_import_all"
      | "product_sync_opened"
      | "product_sync_modified";
    goodsno: string;
    requestedAt: Date;
    started: number;
    success: boolean;
    responseStatus: number | null;
    responseCount: number | null;
    errorCode?: string;
    errorMessage?: string;
    parameters?: Record<string, string>;
  }) {
    try {
      await this.logs.save({
        requestId: input.requestId,
        supplierCode: this.supplier.code,
        requestType: input.requestType,
        sanitizedParameters: input.parameters ?? { goodsno: input.goodsno },
        requestedAt: input.requestedAt,
        completedAt: new Date(),
        success: input.success,
        responseStatus: input.responseStatus,
        responseCount: input.responseCount,
        durationMs: Math.round(performance.now() - input.started),
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
      });
    } catch {
      logger.error("supplier_api_call_log_failed", {
        requestId: input.requestId,
        supplierCode: this.supplier.code,
        errorCode: "audit_log_error",
      });
    }
  }
}

function syncParameters(query: SupplierProductsQuery): Record<string, string> {
  if (query.opened) {
    return { opendate_s: query.opened.from, opendate_e: query.opened.to };
  }
  if (query.modified) {
    return { modidate_s: query.modified.from, modidate_e: query.modified.to };
  }
  return {};
}

function startOfTodayInKorea(now = new Date()): Date {
  const koreaOffsetMs = 9 * 60 * 60 * 1000;
  const koreaNow = new Date(now.getTime() + koreaOffsetMs);
  return new Date(
    Date.UTC(
      koreaNow.getUTCFullYear(),
      koreaNow.getUTCMonth(),
      koreaNow.getUTCDate(),
    ) - koreaOffsetMs,
  );
}

function toPreview(row: {
  externalProductId: string;
  originalName: string | null;
  supplierPrice: string | null;
  currency: string;
  availability: string;
  originalImages: string[];
  originalOptions: unknown[];
  supplierUpdatedAt: Date | null;
}): ImportProductPreview {
  return {
    externalProductId: row.externalProductId,
    originalName: row.originalName,
    supplierPrice: row.supplierPrice,
    currency: row.currency,
    availability: row.availability,
    imageUrl: row.originalImages[0] ?? null,
    imageCount: row.originalImages.length,
    optionCount: row.originalOptions.length,
    supplierUpdatedAt: row.supplierUpdatedAt?.toISOString() ?? null,
  };
}
