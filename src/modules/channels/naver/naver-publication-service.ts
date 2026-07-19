import "server-only";
import type { ProductPublicationRow } from "@/lib/db/schema";
import type { ProductEditRepository } from "@/modules/products/product-edit-repository";
import {
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from "@/modules/products/product-errors";
import { NaverCommerceError } from "./naver-commerce-client";
import type { NaverCategoriesClient } from "./naver-commerce-relay";
import { buildNaverProductPayload } from "./naver-product-payload";
import type { NaverPublicationPolicyRepository } from "./naver-publication-policy-repository";
import type { NaverPublicationRepository } from "./naver-publication-repository";
import { planNaverPublication } from "./naver-publication";

export class NaverPublicationService {
  constructor(
    private readonly products: ProductEditRepository,
    private readonly policies: NaverPublicationPolicyRepository,
    private readonly publications: NaverPublicationRepository,
    private readonly client?: Pick<NaverCategoriesClient, "createProduct">,
  ) {}

  async inspect(productId: string, ownerId: string) {
    const [current, policy, publication] = await Promise.all([
      this.products.find(productId, ownerId),
      this.policies.getForProduct(productId, ownerId),
      this.publications.findForProduct(productId, ownerId),
    ]);
    if (!current) return null;
    const result = buildNaverProductPayload(
      {
        sellerManagementCode: current.supplier.externalProductId,
        title: current.product.title,
        sellingPrice: current.product.sellingPrice,
        description: current.product.description,
        naverCategoryId: current.product.naverCategoryId,
        searchTags: current.product.searchTags,
        selectedImages: current.product.selectedImages,
        editedOptions: current.product.editedOptions,
        naverAttributes: current.product.naverAttributes,
      },
      policy.effective,
    );
    if (!result.ok) {
      return {
        ready: false as const,
        issues: result.issues,
        publication: summarizePublication(publication),
      };
    }
    const action = planNaverPublication(publication, result.hash);
    return {
      ready: true as const,
      payloadHash: result.hash,
      action,
      publication: summarizePublication(publication),
    };
  }

  async publish(
    productId: string,
    ownerId: string,
    expectedPayloadHash: string,
  ) {
    if (!this.client) throw new NaverPublicationUnavailableError();
    const [current, policy, publication] = await Promise.all([
      this.products.find(productId, ownerId),
      this.policies.getForProduct(productId, ownerId),
      this.publications.findForProduct(productId, ownerId),
    ]);
    if (!current) throw new ProductNotFoundError();
    const result = buildNaverProductPayload(
      {
        sellerManagementCode: current.supplier.externalProductId,
        title: current.product.title,
        sellingPrice: current.product.sellingPrice,
        description: current.product.description,
        naverCategoryId: current.product.naverCategoryId,
        searchTags: current.product.searchTags,
        selectedImages: current.product.selectedImages,
        editedOptions: current.product.editedOptions,
        naverAttributes: current.product.naverAttributes,
      },
      policy.effective,
    );
    if (!result.ok) {
      throw new ProductValidationError(
        Object.fromEntries(result.issues.map((issue) => [issue.path, issue.message])),
      );
    }
    if (result.hash !== expectedPayloadHash) throw new ProductConflictError();
    const action = planNaverPublication(publication, result.hash);
    if (action === "unchanged") {
      return { kind: "unchanged" as const, publication: summarizePublication(publication) };
    }
    if (action === "blocked") throw new NaverPublicationBlockedError();
    if (action === "update") throw new NaverPublicationUpdateRequiredError();

    const attempt = await this.publications.beginPublishing(
      productId,
      ownerId,
      result.hash,
      "create",
    );
    let created;
    try {
      created = await this.client.createProduct(result.payload);
    } catch (error) {
      const failure = publicationFailure(error);
      await this.publications.markFailed(
        attempt.id,
        attempt.lastRequestId,
        failure,
      );
      throw error;
    }
    const saved = await this.publications.markPublished(
      attempt.id,
      attempt.lastRequestId,
      created,
    );
    return { kind: "published" as const, publication: summarizePublication(saved) };
  }
}

function publicationFailure(error: unknown) {
  if (error instanceof NaverCommerceError) {
    return {
      code: error.code,
      message: error.message,
      httpStatus: error.responseStatus,
    };
  }
  return {
    code: "internal_error",
    message: "상품 등록 결과를 처리하지 못했습니다.",
  };
}

export class NaverPublicationUnavailableError extends Error {
  readonly code = "naver_publication_unavailable";
  constructor() {
    super("네이버 상품 등록 연결이 설정되지 않았습니다.");
  }
}

export class NaverPublicationBlockedError extends Error {
  readonly code = "naver_publication_blocked";
  constructor() {
    super("이전 등록 요청의 결과 확인이 필요하거나 다른 요청이 처리 중입니다.");
  }
}

export class NaverPublicationUpdateRequiredError extends Error {
  readonly code = "naver_publication_update_required";
  constructor() {
    super("이미 등록된 상품입니다. 상품 수정 기능으로 반영해 주세요.");
  }
}

function summarizePublication(publication: ProductPublicationRow | null) {
  if (!publication) return null;
  return {
    status: publication.status,
    originProductNo: publication.originProductNo,
    channelProductNo: publication.channelProductNo,
    lastPayloadHash: publication.lastPayloadHash,
    attemptedPayloadHash: publication.attemptedPayloadHash,
    attemptCount: publication.attemptCount,
    lastErrorCode: publication.lastErrorCode,
    lastErrorMessage: publication.lastErrorMessage,
    lastErrorHttpStatus: publication.lastErrorHttpStatus,
    lastAttemptedAt: publication.lastAttemptedAt.toISOString(),
    publishedAt: publication.publishedAt?.toISOString() ?? null,
    lastSyncedAt: publication.lastSyncedAt?.toISOString() ?? null,
  };
}
