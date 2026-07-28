import "server-only";
import type { Database } from "@/lib/db";
import { ProductEditRepository } from "@/modules/products/product-edit-repository";
import {
  ProductNotFoundError,
  ProductValidationError,
} from "@/modules/products/product-errors";
import {
  NaverBulkJobRepository,
  type NaverBulkJobType,
} from "./naver-bulk-job-repository";
import { createConfiguredNaverClientForUser } from "./naver-category-service";
import { NaverCommerceError } from "./naver-commerce-client";
import { NaverImageUploadCacheRepository } from "./naver-image-upload-cache-repository";
import {
  NaverImageUploadProgressError,
  NaverImageUploadService,
} from "./naver-image-upload-service";
import { NaverPublicationPolicyRepository } from "./naver-publication-policy-repository";
import { NaverPublicationRepository } from "./naver-publication-repository";
import { NaverPublicationService } from "./naver-publication-service";
import { NaverStoreTargetRepository } from "./naver-store-target-repository";

export class NaverBulkJobService {
  private readonly jobs: NaverBulkJobRepository;

  constructor(private readonly database: Database) {
    this.jobs = new NaverBulkJobRepository(database);
  }

  create(ownerId: string, type: NaverBulkJobType, productIds: string[]) {
    return this.jobs.create(ownerId, type, productIds);
  }

  list(ownerId: string) {
    return this.jobs.list(ownerId);
  }

  async runNext(jobId: string, ownerId: string) {
    const claimed = await this.jobs.claim(jobId, ownerId);
    if (!claimed) throw new ProductNotFoundError();
    if (!claimed.item) {
      return {
        job: await this.jobs.refresh(jobId, ownerId),
        waiting: true,
      };
    }
    try {
      await this.execute(
        claimed.job.type,
        claimed.item.productId,
        ownerId,
      );
      await this.jobs.finishItem(jobId, claimed.item.id, { success: true });
    } catch (error) {
      const source =
        error instanceof NaverImageUploadProgressError
          ? error.originalError
          : error;
      await this.jobs.finishItem(jobId, claimed.item.id, {
        success: false,
        message: errorMessage(source),
        retry: isTransient(source),
        attempts: claimed.item.attempts,
      });
    }
    return {
      job: await this.jobs.refresh(jobId, ownerId),
      waiting: false,
    };
  }

  private async execute(
    type: NaverBulkJobType,
    productId: string,
    ownerId: string,
  ) {
    const products = new ProductEditRepository(this.database);
    const [current, targetStore] = await Promise.all([
      products.find(productId, ownerId),
      new NaverStoreTargetRepository(this.database).getForProduct(
        productId,
        ownerId,
      ),
    ]);
    if (!current) throw new ProductNotFoundError();
    if (!targetStore) {
      throw new ProductValidationError({
        storeConnectionId: "발행 대상 스마트스토어가 필요합니다.",
      });
    }
    const client = await createConfiguredNaverClientForUser(
      this.database,
      ownerId,
      undefined,
      targetStore.id,
    );
    if (type === "upload_images") {
      await new NaverImageUploadService(
        products,
        client,
        fetch,
        new NaverImageUploadCacheRepository(this.database),
        targetStore.id,
      ).upload(productId, ownerId, current.product.draftVersion);
      return;
    }

    const publications = new NaverPublicationService(
      products,
      new NaverPublicationPolicyRepository(this.database),
      new NaverPublicationRepository(this.database),
      client,
    );
    const inspection = await publications.inspect(
      productId,
      ownerId,
      targetStore.id,
    );
    if (!inspection) throw new ProductNotFoundError();
    if (!inspection.ready || !inspection.payloadHash) {
      throw new ProductValidationError(
        Object.fromEntries(
          (inspection.issues ?? []).map((issue) => [
            issue.path,
            issue.message,
          ]),
        ),
      );
    }
    if (inspection.action === "unchanged") return;
    if (inspection.action === "update") {
      await publications.update(
        productId,
        ownerId,
        inspection.payloadHash,
        targetStore.id,
      );
      return;
    }
    if (
      inspection.action === "create" ||
      inspection.action === "retry_create"
    ) {
      await publications.publish(
        productId,
        ownerId,
        inspection.payloadHash,
        targetStore.id,
      );
      return;
    }
    throw new Error("이전 네이버 발행 작업의 결과 확인이 필요합니다.");
  }
}

function isTransient(error: unknown) {
  return (
    error instanceof NaverCommerceError &&
    (error.code === "timeout" ||
      !error.responseStatus ||
      error.responseStatus >= 500)
  );
}

function errorMessage(error: unknown) {
  if (error instanceof ProductValidationError) {
    return Object.values(error.errors).join(" · ");
  }
  return error instanceof Error
    ? error.message
    : "네이버 대량 작업을 처리하지 못했습니다.";
}
