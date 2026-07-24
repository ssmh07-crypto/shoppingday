import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProductPublicationRow } from "@/lib/db/schema";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";

const { buildPayload } = vi.hoisted(() => ({ buildPayload: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/modules/channels/naver/naver-product-payload", () => ({
  buildNaverProductPayload: buildPayload,
}));

import { NaverPublicationService } from "@/modules/channels/naver/naver-publication-service";

const hash = "a".repeat(64);
const payload = { originProduct: {}, smartstoreChannelProduct: {} };

function publication(
  overrides: Partial<ProductPublicationRow> = {},
): ProductPublicationRow {
  const now = new Date("2026-07-18T00:00:00.000Z");
  return {
    id: "00000000-0000-4000-8000-000000000001",
    productId: "00000000-0000-4000-8000-000000000002",
    channel: "naver",
    status: "publishing",
    originProductNo: null,
    channelProductNo: null,
    lastPayloadHash: null,
    attemptedPayloadHash: hash,
    lastRequestId: "00000000-0000-4000-8000-000000000003",
    attemptCount: 1,
    lastErrorCode: null,
    lastErrorMessage: null,
    lastErrorHttpStatus: null,
    lastAttemptedAt: now,
    publishedAt: null,
    lastSyncedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function setup() {
  const current = {
    product: {
      title: "테스트 상품",
      sellingPrice: 10000,
      description: "상세",
      naverCategoryId: "50000000",
      searchTags: [],
      selectedImages: [],
      editedOptions: { groups: [], combinations: [] },
      naverAttributes: [],
    },
    supplier: { externalProductId: "SELLER-001" },
  };
  const attempt = publication();
  const saved = publication({
    status: "published",
    originProductNo: "100000001",
    channelProductNo: "200000001",
    lastPayloadHash: hash,
  });
  const products = { find: vi.fn().mockResolvedValue(current) };
  const policies = {
    getForProduct: vi.fn().mockResolvedValue({ effective: {} }),
  };
  const publications = {
    findForProduct: vi.fn().mockResolvedValue(null),
    beginPublishing: vi.fn().mockResolvedValue(attempt),
    markPublished: vi.fn().mockResolvedValue(saved),
    markFailed: vi.fn().mockResolvedValue(publication({ status: "failed" })),
  };
  const client = {
    createProduct: vi.fn().mockResolvedValue({
      originProductNo: "100000001",
      channelProductNo: "200000001",
    }),
  };
  const service = new NaverPublicationService(
    products as never,
    policies as never,
    publications as never,
    client,
  );
  return { service, publications, client, attempt };
}

describe("네이버 상품 발행 서비스", () => {
  beforeEach(() => {
    buildPayload.mockReset();
    buildPayload.mockReturnValue({ ok: true, payload, hash });
  });

  it("상태를 선점한 뒤 네이버 등록 번호를 성공 상태로 저장한다", async () => {
    const { service, publications, client, attempt } = setup();

    await expect(
      service.publish(attempt.productId, "owner-1", hash),
    ).resolves.toMatchObject({
      kind: "published",
      publication: {
        originProductNo: "100000001",
        channelProductNo: "200000001",
      },
    });
    expect(publications.beginPublishing).toHaveBeenCalledWith(
      attempt.productId,
      "owner-1",
      hash,
      "create",
    );
    expect(client.createProduct).toHaveBeenCalledWith(payload);
    expect(publications.markPublished).toHaveBeenCalledWith(
      attempt.id,
      attempt.lastRequestId,
      {
        originProductNo: "100000001",
        channelProductNo: "200000001",
      },
    );
    expect(publications.markFailed).not.toHaveBeenCalled();
  });

  it("확인 후 payload가 바뀌면 외부 호출 전에 거부한다", async () => {
    const { service, publications, client, attempt } = setup();

    await expect(
      service.publish(attempt.productId, "owner-1", "b".repeat(64)),
    ).rejects.toMatchObject({ code: "product_conflict" });
    expect(publications.beginPublishing).not.toHaveBeenCalled();
    expect(client.createProduct).not.toHaveBeenCalled();
  });

  it("네이버 호출 실패를 같은 요청 ID의 실패 상태로 기록한다", async () => {
    const { service, publications, client, attempt } = setup();
    client.createProduct.mockRejectedValue(
      new NaverCommerceError(
        "request_failed",
        "네이버 입력값을 확인해 주세요.",
        400,
      ),
    );

    await expect(
      service.publish(attempt.productId, "owner-1", hash),
    ).rejects.toMatchObject({ code: "request_failed", responseStatus: 400 });
    expect(publications.markFailed).toHaveBeenCalledWith(
      attempt.id,
      attempt.lastRequestId,
      {
        code: "request_failed",
        message: "네이버 입력값을 확인해 주세요.",
        httpStatus: 400,
      },
    );
    expect(publications.markPublished).not.toHaveBeenCalled();
  });
});
