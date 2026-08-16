import { z } from "zod";
import {
  NaverCommerceError,
  logNaverRequestTiming,
  parseNaverCommerceCategories,
  parseNaverCommerceProductAttributes,
  parseNaverCommerceProductAttributeUnits,
  parseNaverCommerceProductAttributeValues,
  parseNaverCommerceProductModels,
  parseNaverCommerceStandardOptions,
  parseNaverCommerceProvidedNotice,
  parseNaverCommerceProvidedNotices,
  parseNaverCommerceUploadedImages,
  parseNaverCommerceCreatedProduct,
  parseNaverCommerceChannelProduct,
  parseNaverCommerceSellerAddresses,
  parseNaverCommerceDeliveryBundleGroups,
  parseNaverCommerceReturnDeliveryCompanies,
  parseNaverCommerceRecommendedSellerTags,
  parseNaverCommerceChangedProductOrders,
  parseNaverCommerceProductOrders,
  type NaverCommerceCategory,
  type NaverCommerceProductAttribute,
  type NaverCommerceProductAttributeUnit,
  type NaverCommerceProductAttributeValue,
  type NaverCommerceProductModel,
  type NaverCommerceStandardOptions,
  type NaverCommerceProvidedNotice,
  type NaverCommerceUploadedImage,
  type NaverCommerceCreatedProduct,
  type NaverCommerceChannelProduct,
  type NaverCommerceSellerAddress,
  type NaverCommerceDeliveryBundleGroup,
  type NaverCommerceReturnDeliveryCompany,
  type NaverCommerceSellerTag,
  type NaverCommerceChangedProductOrders,
  type NaverCommerceProductOrder,
  type NaverImageUploadFile,
} from "./naver-commerce-client";
import type { NaverProductPayload } from "./naver-product-payload";
import {
  createNaverRelaySignature,
  NAVER_RELAY_HEADERS,
  verifyNaverRelaySignature,
} from "./naver-relay-auth";
import {
  naverShoppingRankRequestSchema,
  naverShoppingRankResponseSchema,
  type NaverShoppingRankReader,
  type NaverShoppingRankRequest,
} from "./naver-shopping-rank";

export type NaverCommerceRelayConfig = {
  relayUrl: string;
  sharedSecret: string;
  timeoutMs: number;
  tokenType?: "SELF" | "SELLER";
  accountId?: string | null;
};

export interface NaverCategoriesClient {
  fetchCategories(options?: {
    last?: boolean;
  }): Promise<NaverCommerceCategory[]>;
  fetchProductModels(
    name: string,
    size?: number,
  ): Promise<NaverCommerceProductModel[]>;
  fetchProductAttributes(
    categoryId: string,
  ): Promise<NaverCommerceProductAttribute[]>;
  fetchProductAttributeValues(
    categoryId: string,
  ): Promise<NaverCommerceProductAttributeValue[]>;
  fetchProductAttributeUnits(): Promise<NaverCommerceProductAttributeUnit[]>;
  fetchStandardOptions(
    categoryId: string,
  ): Promise<NaverCommerceStandardOptions>;
  fetchProvidedNotices(categoryId?: string): Promise<NaverCommerceProvidedNotice[]>;
  fetchProvidedNotice(type: string): Promise<NaverCommerceProvidedNotice>;
  uploadProductImages(files: NaverImageUploadFile[]): Promise<NaverCommerceUploadedImage[]>;
  createProduct(payload: NaverProductPayload): Promise<NaverCommerceCreatedProduct>;
  updateProduct(originProductNo: string, payload: NaverProductPayload): Promise<NaverCommerceCreatedProduct>;
  changeProductStatus(
    originProductNo: string,
    input: {
      statusType: "SALE" | "OUTOFSTOCK" | "SUSPENSION";
      stockQuantity?: number;
    },
  ): Promise<{ success: true }>;
  deleteChannelProduct(channelProductNo: string): Promise<{ success: true }>;
  deleteOriginProduct(originProductNo: string): Promise<{ success: true }>;
  fetchChannelProduct(channelProductNo: string): Promise<NaverCommerceChannelProduct>;
  fetchSellerAddresses(): Promise<NaverCommerceSellerAddress[]>;
  fetchDeliveryBundleGroups(): Promise<NaverCommerceDeliveryBundleGroup[]>;
  fetchReturnDeliveryCompanies(): Promise<NaverCommerceReturnDeliveryCompany[]>;
  fetchRecommendTags?(keyword: string): Promise<NaverCommerceSellerTag[]>;
  fetchLastChangedProductOrders?(input: {
    lastChangedFrom: string;
    lastChangedTo: string;
    moreSequence?: string;
  }): Promise<NaverCommerceChangedProductOrders>;
  fetchProductOrders?(
    productOrderIds: string[],
  ): Promise<NaverCommerceProductOrder[]>;
}

export class NaverCommerceRelayClient implements NaverCategoriesClient {
  constructor(
    private readonly config: NaverCommerceRelayConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
    private readonly createNonce: () => string = () => crypto.randomUUID(),
    private readonly wait: (delayMs: number) => Promise<void> = (delayMs) =>
      new Promise((resolve) => setTimeout(resolve, delayMs)),
  ) {}

  async fetchCategories(options: { last?: boolean } = {}) {
    const url = this.relayUrl("v1/categories");
    if (options.last !== undefined) {
      url.searchParams.set("last", String(options.last));
    }

    const response = await this.requestWithRetry(url);
    return parseNaverCommerceCategories(response);
  }

  async fetchProductModels(name: string, size = 20) {
    const url = this.relayUrl("v1/product-models");
    url.searchParams.set("name", name);
    url.searchParams.set("size", String(size));
    const response = await this.requestWithRetry(url);
    return parseNaverCommerceProductModels(response);
  }

  async fetchProductAttributes(categoryId: string) {
    const url = this.relayUrl("v1/product-attributes/attributes");
    url.searchParams.set("categoryId", categoryId);
    return parseNaverCommerceProductAttributes(
      await this.requestWithRetry(url),
    );
  }

  async fetchProductAttributeValues(categoryId: string) {
    const url = this.relayUrl("v1/product-attributes/attribute-values");
    url.searchParams.set("categoryId", categoryId);
    return parseNaverCommerceProductAttributeValues(
      await this.requestWithRetry(url),
    );
  }

  async fetchProductAttributeUnits() {
    const url = this.relayUrl("v1/product-attributes/attribute-value-units");
    return parseNaverCommerceProductAttributeUnits(
      await this.requestWithRetry(url),
    );
  }

  async fetchStandardOptions(categoryId: string) {
    const url = this.relayUrl("v1/options/standard-options");
    url.searchParams.set("categoryId", categoryId);
    return parseNaverCommerceStandardOptions(await this.requestWithRetry(url));
  }

  async fetchProvidedNotices(categoryId?: string) {
    const url = this.relayUrl("v1/products-for-provided-notice");
    if (categoryId) url.searchParams.set("categoryId", categoryId);
    return parseNaverCommerceProvidedNotices(await this.requestWithRetry(url));
  }

  async fetchProvidedNotice(type: string) {
    const url = this.relayUrl(
      `v1/products-for-provided-notice/${encodeURIComponent(type)}`,
    );
    return parseNaverCommerceProvidedNotice(await this.requestWithRetry(url));
  }

  async uploadProductImages(files: NaverImageUploadFile[]) {
    const form = new FormData();
    for (const file of files) {
      form.append(
        "imageFiles",
        new Blob([file.bytes as BlobPart], { type: file.type }),
        file.name,
      );
    }
    const encoded = new Response(form);
    const contentType = encoded.headers.get("content-type");
    if (!contentType) throw new NaverCommerceError("request_failed", "이미지 업로드 요청을 만들지 못했습니다.");
    const body = new Uint8Array(await encoded.arrayBuffer());
    const response = await this.request(this.relayUrl("v1/product-images/upload"), {
      method: "POST",
      body,
      contentType,
    });
    if (!response.ok) {
      throw new NaverCommerceError(
        response.status === 504 ? "timeout" : "request_failed",
        "네이버 이미지 업로드 중계 요청에 실패했습니다.",
        response.status,
      );
    }
    return parseNaverCommerceUploadedImages(response);
  }

  async createProduct(payload: NaverProductPayload) {
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const response = await this.request(this.relayUrl("v2/products"), {
      method: "POST",
      body,
      contentType: "application/json;charset=UTF-8",
    });
    return parseNaverCommerceCreatedProduct(response);
  }

  async updateProduct(originProductNo: string, payload: NaverProductPayload) {
    assertProductNo(originProductNo);
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const response = await this.request(
      this.relayUrl(`v2/products/origin-products/${originProductNo}`),
      {
        method: "PUT",
        body,
        contentType: "application/json;charset=UTF-8",
      },
    );
    return parseNaverCommerceCreatedProduct(response);
  }

  async changeProductStatus(
    originProductNo: string,
    input: {
      statusType: "SALE" | "OUTOFSTOCK" | "SUSPENSION";
      stockQuantity?: number;
    },
  ) {
    assertProductNo(originProductNo);
    const body = new TextEncoder().encode(JSON.stringify(input));
    await this.request(
      this.relayUrl(
        `v1/products/origin-products/${originProductNo}/change-status`,
      ),
      {
        method: "PUT",
        body,
        contentType: "application/json;charset=UTF-8",
      },
    );
    return { success: true as const };
  }

  async deleteChannelProduct(channelProductNo: string) {
    assertProductNo(channelProductNo);
    await this.request(
      this.relayUrl(`v2/products/channel-products/${channelProductNo}`),
      { method: "DELETE" },
    );
    return { success: true as const };
  }

  async deleteOriginProduct(originProductNo: string) {
    assertProductNo(originProductNo);
    await this.request(
      this.relayUrl(`v2/products/origin-products/${originProductNo}`),
      { method: "DELETE" },
    );
    return { success: true as const };
  }

  async fetchChannelProduct(channelProductNo: string) {
    if (!/^\d{1,20}$/.test(channelProductNo)) {
      throw new NaverCommerceError(
        "request_failed",
        "네이버 채널 상품 번호 형식이 올바르지 않습니다.",
      );
    }
    const url = this.relayUrl(`v2/products/channel-products/${channelProductNo}`);
    return parseNaverCommerceChannelProduct(await this.requestWithRetry(url));
  }

  async fetchSellerAddresses() {
    const url = this.relayUrl("v1/seller/addressbooks-for-page");
    return parseNaverCommerceSellerAddresses(await this.requestWithRetry(url));
  }

  async fetchDeliveryBundleGroups() {
    const url = this.relayUrl("v1/product-delivery-info/bundle-groups");
    return parseNaverCommerceDeliveryBundleGroups(
      await this.requestWithRetry(url),
    );
  }

  async fetchReturnDeliveryCompanies() {
    const url = this.relayUrl(
      "v2/product-delivery-info/return-delivery-companies",
    );
    return parseNaverCommerceReturnDeliveryCompanies(
      await this.requestWithRetry(url),
    );
  }

  async fetchLastChangedProductOrders(input: {
    lastChangedFrom: string;
    lastChangedTo: string;
    moreSequence?: string;
  }) {
    const url = this.relayUrl(
      "v1/pay-order/seller/product-orders/last-changed-statuses",
    );
    url.searchParams.set("lastChangedFrom", input.lastChangedFrom);
    url.searchParams.set("lastChangedTo", input.lastChangedTo);
    url.searchParams.set("limitCount", "300");
    if (input.moreSequence) {
      url.searchParams.set("moreSequence", input.moreSequence);
    }
    return parseNaverCommerceChangedProductOrders(
      await this.requestWithRetry(url),
    );
  }

  async fetchProductOrders(productOrderIds: string[]) {
    const body = new TextEncoder().encode(
      JSON.stringify({
        productOrderIds,
        quantityClaimCompatibility: true,
      }),
    );
    const response = await this.request(
      this.relayUrl("v1/pay-order/seller/product-orders/query"),
      {
        method: "POST",
        body,
        contentType: "application/json;charset=UTF-8",
      },
    );
    return parseNaverCommerceProductOrders(response);
  }

  async fetchRecommendTags(keyword: string) {
    const url = this.relayUrl("v2/tags/recommend-tags");
    url.searchParams.set("keyword", keyword.trim());
    return parseNaverCommerceRecommendedSellerTags(
      await this.requestWithRetry(url),
    );
  }

  async observeShoppingRanks(input: NaverShoppingRankRequest) {
    const body = new TextEncoder().encode(JSON.stringify(input));
    const response = await this.request(
      this.relayUrl("v1/shopping-rank/observe"),
      {
        method: "POST",
        body,
        contentType: "application/json;charset=UTF-8",
        timeoutMs: Math.max(this.config.timeoutMs, 55_000),
      },
    );
    return naverShoppingRankResponseSchema.parse(await response.json());
  }

  private relayUrl(path: string) {
    const base = this.config.relayUrl.endsWith("/")
      ? this.config.relayUrl
      : `${this.config.relayUrl}/`;
    return new URL(path, base);
  }

  private async requestWithRetry(url: URL) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.request(url);
        if (![502, 503, 504].includes(response.status)) {
          return response;
        }
        if (attempt === 1) {
          throw new NaverCommerceError(
            response.status === 504 ? "timeout" : "request_failed",
            "네이버 API 중계 서버 요청에 실패했습니다.",
            response.status,
          );
        }
      } catch (error) {
        lastError = error;
        if (
          attempt === 1 ||
          !(error instanceof NaverCommerceError) ||
          !["request_failed", "timeout"].includes(error.code)
        ) {
          throw error;
        }
      }
      await this.wait(150);
    }
    throw lastError;
  }

  private async request(
    url: URL,
    options: {
      method?: "GET" | "POST" | "PUT" | "DELETE";
      body?: Uint8Array;
      contentType?: string;
      timeoutMs?: number;
    } = {},
  ) {
    const timestamp = this.now();
    const nonce = this.createNonce();
    const pathAndQuery = `${url.pathname}${url.search}`;
    const method = options.method ?? "GET";
    const signature = await createNaverRelaySignature(
      this.config.sharedSecret,
      {
        timestamp,
        nonce,
        method,
        pathAndQuery,
        body: options.body,
        tokenType: this.config.tokenType,
        accountId: this.config.accountId,
      },
    );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? this.config.timeoutMs,
    );
    const started = performance.now();
    let responseStatus: number | undefined;
    let errorCode: string | undefined;

    try {
      const response = await this.fetcher(url, {
        method,
        headers: {
          accept: "application/json;charset=UTF-8",
          ...(options.contentType ? { "content-type": options.contentType } : {}),
          [NAVER_RELAY_HEADERS.timestamp]: String(timestamp),
          [NAVER_RELAY_HEADERS.nonce]: nonce,
          [NAVER_RELAY_HEADERS.signature]: signature,
          ...(this.config.tokenType
            ? { [NAVER_RELAY_HEADERS.tokenType]: this.config.tokenType }
            : {}),
          ...(this.config.accountId
            ? { [NAVER_RELAY_HEADERS.accountId]: this.config.accountId }
            : {}),
        },
        ...(options.body
          ? { body: new Blob([options.body as BlobPart]) }
          : {}),
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
      });
      responseStatus = response.status;
      if (response.status >= 300 && response.status < 400) {
        throw new NaverCommerceError(
          "request_failed",
          "네이버 API 중계 서버가 예상하지 못한 리디렉션을 반환했습니다.",
          response.status,
        );
      }
      if (!response.ok && ![502, 503, 504].includes(response.status)) {
        const relayError = await readRelayError(response);
        throw new NaverCommerceError(
          relayError?.code === "relay_authentication_failed"
            ? "authentication_failed"
            : "request_failed",
          relayError?.code === "relay_authentication_failed"
            ? "네이버 API 중계 서버 인증에 실패했습니다."
            : relayError?.message ?? "네이버 API 중계 요청에 실패했습니다.",
          response.status,
          relayError?.invalidInputs,
        );
      }
      return response;
    } catch (error) {
      errorCode =
        error instanceof NaverCommerceError ? error.code : "request_failed";
      if (error instanceof NaverCommerceError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new NaverCommerceError(
          "timeout",
          "네이버 API 중계 서버 응답 시간이 초과되었습니다.",
        );
      }
      throw new NaverCommerceError(
        "request_failed",
        "네이버 API 중계 서버에 연결할 수 없습니다.",
      );
    } finally {
      clearTimeout(timeout);
      logNaverRequestTiming({
        transport: "relay",
        method,
        path: url.pathname,
        responseStatus,
        errorCode,
        started,
      });
    }
  }
}

function assertProductNo(value: string) {
  if (!/^\d{1,20}$/.test(value)) {
    throw new NaverCommerceError(
      "request_failed",
      "네이버 상품 번호 형식이 올바르지 않습니다.",
    );
  }
}

const relayQuerySchema = z.object({
  last: z.enum(["true", "false"]).optional(),
});
const relayProductModelQuerySchema = z.object({
  name: z.string().trim().min(2).max(200),
  size: z.coerce.number().int().min(1).max(100).default(20),
});
const relayCategoryMetadataQuerySchema = z.object({
  categoryId: z.string().regex(/^\d+$/).max(20),
});
const relayRecommendTagQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(100),
});
const providedNoticeTypeSchema = z.string().regex(/^[A-Z_]{2,40}$/);
const naverImageUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "shop-phinf.pstatic.net";
});
const productCreateSchema = z.looseObject({
  originProduct: z.looseObject({
    statusType: z.enum(["SALE", "SUSPENSION"]),
    saleType: z.literal("NEW"),
    leafCategoryId: z.string().regex(/^\d{1,20}$/),
    name: z.string().trim().min(1).max(100),
    detailContent: z.string().min(1).max(3_000_000),
    images: z.object({
      representativeImage: z.object({ url: naverImageUrlSchema }),
      optionalImages: z
        .array(z.object({ url: naverImageUrlSchema }))
        .max(9),
    }),
    salePrice: z.number().int().min(1).max(999_999_990),
    stockQuantity: z.number().int().min(0).max(99_999_999),
    deliveryInfo: z.record(z.string(), z.unknown()),
    detailAttribute: z.record(z.string(), z.unknown()),
  }),
  smartstoreChannelProduct: z.looseObject({
    naverShoppingRegistration: z.boolean(),
    channelProductDisplayStatusType: z.enum(["ON", "SUSPENSION"]),
  }),
});
const productStatusChangeSchema = z.object({
  statusType: z.enum(["SALE", "OUTOFSTOCK", "SUSPENSION"]),
  stockQuantity: z.number().int().min(0).max(99_999_999).optional(),
});
const orderChangeQuerySchema = z.object({
  lastChangedFrom: z.string().datetime(),
  lastChangedTo: z.string().datetime(),
  limitCount: z.literal("300"),
  moreSequence: z.string().min(1).max(100).optional(),
});
const productOrdersQuerySchema = z.object({
  productOrderIds: z.array(z.string().min(1).max(30)).min(1).max(300),
  quantityClaimCompatibility: z.literal(true),
});

const RELAY_PATHS = [
  "/v1/categories",
  "/v1/product-models",
  "/v1/product-attributes/attributes",
  "/v1/product-attributes/attribute-values",
  "/v1/product-attributes/attribute-value-units",
  "/v1/options/standard-options",
  "/v1/products-for-provided-notice",
  "/v1/seller/addressbooks-for-page",
  "/v1/product-delivery-info/bundle-groups",
  "/v2/product-delivery-info/return-delivery-companies",
  "/v2/tags/recommend-tags",
] as const;
const IMAGE_UPLOAD_PATH = "/v1/product-images/upload";
const PRODUCT_CREATE_PATH = "/v2/products";
const CHANNEL_PRODUCT_PATH = /^\/v2\/products\/channel-products\/(\d{1,20})$/;
const ORIGIN_PRODUCT_PATH = /^\/v2\/products\/origin-products\/(\d{1,20})$/;
const PRODUCT_STATUS_PATH =
  /^\/v1\/products\/origin-products\/(\d{1,20})\/change-status$/;
const ORDER_CHANGE_PATH =
  "/v1/pay-order/seller/product-orders/last-changed-statuses";
const PRODUCT_ORDERS_QUERY_PATH =
  "/v1/pay-order/seller/product-orders/query";
const SHOPPING_RANK_OBSERVE_PATH = "/v1/shopping-rank/observe";
const MAX_PRODUCT_BODY_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_COUNT = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_TOTAL_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

export type NaverRelayHandlerOptions = {
  sharedSecret: string;
  client: NaverCategoriesClient;
  clientFactory?: (context: {
    tokenType: "SELF" | "SELLER";
    accountId: string | null;
  }) => NaverCategoriesClient;
  shoppingRankReader?: NaverShoppingRankReader;
  now?: () => number;
  replayGuard?: NaverRelayReplayGuard;
  maxClockSkewMs?: number;
};

export type NaverRelayClientContext = {
  tokenType: "SELF" | "SELLER";
  accountId: string | null;
};

export function createCachedNaverRelayClientFactory(
  createClient: (context: NaverRelayClientContext) => NaverCategoriesClient,
  maxEntries = 20,
) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new Error("네이버 릴레이 클라이언트 캐시 크기는 1 이상이어야 합니다.");
  }
  const clients = new Map<string, NaverCategoriesClient>();
  return (context: NaverRelayClientContext) => {
    const key = `${context.tokenType}:${context.accountId ?? ""}`;
    const cached = clients.get(key);
    if (cached) {
      clients.delete(key);
      clients.set(key, cached);
      return cached;
    }

    const client = createClient(context);
    clients.set(key, client);
    if (clients.size > maxEntries) {
      const oldestKey = clients.keys().next().value;
      if (oldestKey !== undefined) clients.delete(oldestKey);
    }
    return client;
  };
}

export interface NaverRelayReplayGuard {
  consume(nonce: string, expiresAt: number): boolean;
}

export class MemoryNaverRelayReplayGuard implements NaverRelayReplayGuard {
  private readonly nonces = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  consume(nonce: string, expiresAt: number) {
    const now = this.now();
    for (const [storedNonce, storedExpiresAt] of this.nonces) {
      if (storedExpiresAt <= now) this.nonces.delete(storedNonce);
    }
    if (this.nonces.has(nonce)) return false;
    this.nonces.set(nonce, expiresAt);
    return true;
  }
}

export function createNaverCommerceRelayHandler(
  options: NaverRelayHandlerOptions,
) {
  const now = options.now ?? Date.now;
  const replayGuard =
    options.replayGuard ?? new MemoryNaverRelayReplayGuard(now);
  const maxClockSkewMs = options.maxClockSkewMs ?? 5 * 60_000;

  return async function handle(request: Request) {
    const url = new URL(request.url);
    const isReadRequest =
      request.method === "GET" &&
      (RELAY_PATHS.some((path) => path === url.pathname) ||
        url.pathname.startsWith("/v1/products-for-provided-notice/") ||
        url.pathname === ORDER_CHANGE_PATH ||
        CHANNEL_PRODUCT_PATH.test(url.pathname));
    const isImageUpload =
      request.method === "POST" && url.pathname === IMAGE_UPLOAD_PATH;
    const isProductCreate =
      request.method === "POST" && url.pathname === PRODUCT_CREATE_PATH;
    const isProductUpdate =
      request.method === "PUT" && ORIGIN_PRODUCT_PATH.test(url.pathname);
    const isProductStatusChange =
      request.method === "PUT" && PRODUCT_STATUS_PATH.test(url.pathname);
    const isProductOrdersQuery =
      request.method === "POST" &&
      url.pathname === PRODUCT_ORDERS_QUERY_PATH;
    const isShoppingRankObserve =
      request.method === "POST" &&
      url.pathname === SHOPPING_RANK_OBSERVE_PATH;
    const isProductDelete =
      request.method === "DELETE" &&
      (CHANNEL_PRODUCT_PATH.test(url.pathname) ||
        ORIGIN_PRODUCT_PATH.test(url.pathname));
    if (
      !isReadRequest &&
      !isImageUpload &&
      !isProductCreate &&
      !isProductUpdate &&
      !isProductStatusChange &&
      !isProductOrdersQuery &&
      !isShoppingRankObserve &&
      !isProductDelete
    ) {
      return relayJson(
        404,
        "relay_route_not_found",
        "지원하지 않는 요청입니다.",
      );
    }

    const timestampHeader = request.headers.get(NAVER_RELAY_HEADERS.timestamp);
    const nonce = request.headers.get(NAVER_RELAY_HEADERS.nonce) ?? "";
    const signature = request.headers.get(NAVER_RELAY_HEADERS.signature) ?? "";
    const tokenTypeHeader = request.headers.get(NAVER_RELAY_HEADERS.tokenType);
    const accountIdHeader = request.headers.get(NAVER_RELAY_HEADERS.accountId);
    const authContext =
      tokenTypeHeader === null
        ? null
        : tokenTypeHeader === "SELF"
          ? { tokenType: "SELF" as const, accountId: null }
          : tokenTypeHeader === "SELLER" &&
              accountIdHeader &&
              /^[A-Za-z0-9._@-]{1,100}$/.test(accountIdHeader)
            ? { tokenType: "SELLER" as const, accountId: accountIdHeader }
            : undefined;
    const timestamp = Number(timestampHeader);
    if (
      !timestampHeader ||
      !Number.isSafeInteger(timestamp) ||
      Math.abs(now() - timestamp) > maxClockSkewMs ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) ||
      authContext === undefined
    ) {
      return relayJson(
        401,
        "relay_authentication_failed",
        "중계 요청 인증정보가 올바르지 않습니다.",
      );
    }

    const body =
      isImageUpload ||
      isProductCreate ||
      isProductUpdate ||
      isProductStatusChange ||
      isProductOrdersQuery ||
      isShoppingRankObserve
      ? new Uint8Array(await request.arrayBuffer())
      : undefined;
    if (
      body &&
      ((isImageUpload && body.byteLength > MAX_IMAGE_TOTAL_BYTES + 1024 * 1024) ||
        ((isProductCreate ||
          isProductUpdate ||
          isProductStatusChange ||
          isProductOrdersQuery ||
          isShoppingRankObserve) &&
          body.byteLength > MAX_PRODUCT_BODY_BYTES))
    ) {
      return relayJson(413, "payload_too_large", "중계 요청 본문이 너무 큽니다.");
    }
    const pathAndQuery = `${url.pathname}${url.search}`;
    const valid = await verifyNaverRelaySignature(
      options.sharedSecret,
      {
        timestamp,
        nonce,
        method: request.method,
        pathAndQuery,
        body,
        tokenType: authContext?.tokenType,
        accountId: authContext?.accountId,
      },
      signature,
    );
    if (!valid || !replayGuard.consume(nonce, timestamp + maxClockSkewMs)) {
      return relayJson(
        401,
        "relay_authentication_failed",
        "중계 요청 인증정보가 올바르지 않습니다.",
      );
    }

    try {
      const client =
        authContext && options.clientFactory
          ? options.clientFactory(authContext)
          : options.client;
      const result = await handleRelayRequest(
        url,
        client,
        request,
        body,
        options.shoppingRankReader,
      );
      if (result instanceof Response) return result;
      return Response.json(result, {
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      if (error instanceof NaverCommerceError) {
        const status =
          error.responseStatus &&
          error.responseStatus >= 400 &&
          error.responseStatus < 500
            ? error.responseStatus
            : error.code === "timeout"
              ? 504
              : 502;
        return relayJson(
          status,
          error.code,
          error.message,
          error.invalidInputs,
        );
      }
      return relayJson(
        500,
        "internal_error",
        "중계 요청을 처리하지 못했습니다.",
      );
    }
  };
}

async function handleRelayRequest(
  url: URL,
  client: NaverCategoriesClient,
  request: Request,
  body?: Uint8Array,
  shoppingRankReader?: NaverShoppingRankReader,
) {
  if (url.pathname === SHOPPING_RANK_OBSERVE_PATH) {
    if (url.search) {
      return relayJson(
        400,
        "invalid_request",
        "순위 조회에는 검색 조건을 URL에 입력할 수 없습니다.",
      );
    }
    if (!shoppingRankReader) {
      return relayJson(
        503,
        "not_configured",
        "로컬 순위 조회 기능이 설정되지 않았습니다.",
      );
    }
    const input = parseRelayJsonBody(request, body);
    if (input instanceof Response) return input;
    const parsed = naverShoppingRankRequestSchema.safeParse(input);
    if (!parsed.success) {
      return relayJson(
        400,
        "invalid_request",
        "순위 조회 키워드와 상품 정보를 확인해 주세요.",
      );
    }
    return shoppingRankReader.observe(parsed.data);
  }
  if (url.pathname === ORDER_CHANGE_PATH) {
    const parsed = orderChangeQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      return relayJson(
        400,
        "invalid_request",
        "주문 변경 내역 조회 기간을 확인해 주세요.",
      );
    }
    if (!client.fetchLastChangedProductOrders) {
      return relayJson(
        503,
        "not_configured",
        "주문 조회 기능이 설정되지 않았습니다.",
      );
    }
    const result = await client.fetchLastChangedProductOrders(parsed.data);
    return {
      data: {
        lastChangeStatuses: result.productOrderIds.map((productOrderId) => ({
          productOrderId,
        })),
        ...(result.more ? { more: result.more } : {}),
      },
    };
  }
  if (url.pathname === PRODUCT_ORDERS_QUERY_PATH) {
    if (url.search) {
      return relayJson(
        400,
        "invalid_request",
        "상품 주문 상세 조회에는 검색 조건을 사용할 수 없습니다.",
      );
    }
    const input = parseRelayJsonBody(request, body);
    if (input instanceof Response) return input;
    const parsed = productOrdersQuerySchema.safeParse(input);
    if (!parsed.success) {
      return relayJson(
        400,
        "invalid_request",
        "상품 주문 번호를 확인해 주세요.",
      );
    }
    if (!client.fetchProductOrders) {
      return relayJson(
        503,
        "not_configured",
        "주문 조회 기능이 설정되지 않았습니다.",
      );
    }
    return { data: await client.fetchProductOrders(parsed.data.productOrderIds) };
  }
  const channelProductMatch = CHANNEL_PRODUCT_PATH.exec(url.pathname);
  if (channelProductMatch) {
    if (url.search) {
      return relayJson(400, "invalid_request", "채널 상품 요청에는 검색 조건을 사용할 수 없습니다.");
    }
    if (request.method === "DELETE") {
      return client.deleteChannelProduct(channelProductMatch[1]!);
    }
    return client.fetchChannelProduct(channelProductMatch[1]!);
  }
  const originProductMatch = ORIGIN_PRODUCT_PATH.exec(url.pathname);
  if (originProductMatch) {
    if (url.search) {
      return relayJson(400, "invalid_request", "원상품 요청에는 검색 조건을 사용할 수 없습니다.");
    }
    if (request.method === "DELETE") {
      return client.deleteOriginProduct(originProductMatch[1]!);
    }
    const input = parseRelayJsonBody(request, body);
    if (input instanceof Response) return input;
    const parsed = productCreateSchema.safeParse(input);
    if (!parsed.success) {
      return relayJson(400, "invalid_product", "상품 수정 필수값을 확인해 주세요.");
    }
    return client.updateProduct(
      originProductMatch[1]!,
      parsed.data as NaverProductPayload,
    );
  }
  const statusMatch = PRODUCT_STATUS_PATH.exec(url.pathname);
  if (statusMatch) {
    if (url.search) {
      return relayJson(400, "invalid_request", "판매 상태 변경에는 검색 조건을 사용할 수 없습니다.");
    }
    const input = parseRelayJsonBody(request, body);
    if (input instanceof Response) return input;
    const parsed = productStatusChangeSchema.safeParse(input);
    if (
      !parsed.success ||
      (parsed.data.statusType === "SALE" && !parsed.data.stockQuantity)
    ) {
      return relayJson(400, "invalid_request", "판매 상태와 재고 수량을 확인해 주세요.");
    }
    return client.changeProductStatus(statusMatch[1]!, parsed.data);
  }
  if (url.pathname === PRODUCT_CREATE_PATH) {
    if (
      url.search ||
      !body ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")
    ) {
      return relayJson(400, "invalid_request", "상품 등록 요청이 올바르지 않습니다.");
    }
    const input = parseRelayJsonBody(request, body);
    if (input instanceof Response) return input;
    const parsed = productCreateSchema.safeParse(input);
    if (!parsed.success || parsed.data.originProduct.statusType !== "SALE") {
      return relayJson(400, "invalid_product", "상품 등록 필수값을 확인해 주세요.");
    }
    return client.createProduct(parsed.data as NaverProductPayload);
  }
  if (url.pathname === IMAGE_UPLOAD_PATH) {
    if (url.search || !body) {
      return relayJson(400, "invalid_request", "이미지 업로드 요청이 올바르지 않습니다.");
    }
    const files = await parseRelayImageFiles(request.headers.get("content-type"), body);
    if (files instanceof Response) return files;
    return { images: await client.uploadProductImages(files) };
  }
  if (url.pathname === "/v1/categories") return handleCategories(url, client);
  if (url.pathname === "/v1/seller/addressbooks-for-page") {
    if (url.search) {
      return relayJson(400, "invalid_request", "주소록 조회 조건이 올바르지 않습니다.");
    }
    return client.fetchSellerAddresses();
  }
  if (url.pathname === "/v1/product-delivery-info/bundle-groups") {
    if (url.search) {
      return relayJson(400, "invalid_request", "묶음배송 조회 조건이 올바르지 않습니다.");
    }
    return client.fetchDeliveryBundleGroups();
  }
  if (url.pathname === "/v2/product-delivery-info/return-delivery-companies") {
    if (url.search) {
      return relayJson(400, "invalid_request", "반품 택배사 조회 조건이 올바르지 않습니다.");
    }
    return client.fetchReturnDeliveryCompanies();
  }
  if (url.pathname === "/v2/tags/recommend-tags") {
    const parsed = relayRecommendTagQuerySchema.safeParse(
      Object.fromEntries(url.searchParams),
    );
    if (!parsed.success) {
      return relayJson(400, "invalid_request", "추천 태그 검색어를 확인해 주세요.");
    }
    if (!client.fetchRecommendTags) {
      return relayJson(503, "not_configured", "추천 태그 조회 기능이 설정되지 않았습니다.");
    }
    return client.fetchRecommendTags(parsed.data.keyword);
  }
  if (url.pathname === "/v1/product-models")
    return handleProductModels(url, client);
  if (url.pathname === "/v1/product-attributes/attribute-value-units") {
    if (url.search) {
      return relayJson(
        400,
        "invalid_request",
        "단위 조회에는 검색 조건을 사용할 수 없습니다.",
      );
    }
    return client.fetchProductAttributeUnits();
  }
  if (url.pathname === "/v1/products-for-provided-notice") {
    const categoryId = url.searchParams.get("categoryId") ?? undefined;
    if (
      (categoryId !== undefined && !/^\d{1,20}$/.test(categoryId)) ||
      Array.from(url.searchParams.keys()).some((key) => key !== "categoryId")
    ) {
      return relayJson(400, "invalid_request", "대카테고리 ID를 확인해 주세요.");
    }
    return client.fetchProvidedNotices(categoryId);
  }
  if (url.pathname.startsWith("/v1/products-for-provided-notice/")) {
    if (url.search) {
      return relayJson(400, "invalid_request", "단건 조회에는 검색 조건을 사용할 수 없습니다.");
    }
    const type = decodeURIComponent(url.pathname.slice("/v1/products-for-provided-notice/".length));
    const parsed = providedNoticeTypeSchema.safeParse(type);
    if (!parsed.success) {
      return relayJson(400, "invalid_request", "상품정보제공고시 유형을 확인해 주세요.");
    }
    return client.fetchProvidedNotice(parsed.data);
  }
  const categoryId = parseCategoryMetadataQuery(url);
  if (categoryId instanceof Response) return categoryId;
  if (url.pathname === "/v1/product-attributes/attributes")
    return client.fetchProductAttributes(categoryId);
  if (url.pathname === "/v1/product-attributes/attribute-values")
    return client.fetchProductAttributeValues(categoryId);
  return client.fetchStandardOptions(categoryId);
}

function parseRelayJsonBody(request: Request, body?: Uint8Array) {
  if (
    !body ||
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return relayJson(400, "invalid_request", "JSON 요청 본문이 올바르지 않습니다.");
  }
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown;
  } catch {
    return relayJson(400, "invalid_request", "요청 JSON을 해석할 수 없습니다.");
  }
}

async function parseRelayImageFiles(contentType: string | null, body: Uint8Array) {
  if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
    return relayJson(415, "unsupported_media_type", "multipart 이미지 요청만 허용합니다.");
  }
  let form: FormData;
  try {
    form = await new Request("http://relay.local/upload", {
      method: "POST",
      headers: { "content-type": contentType },
      body: new Blob([body as BlobPart]),
    }).formData();
  } catch {
    return relayJson(400, "invalid_request", "multipart 요청을 해석할 수 없습니다.");
  }
  if (Array.from(form.keys()).some((key) => key !== "imageFiles")) {
    return relayJson(400, "invalid_request", "허용되지 않은 multipart 필드입니다.");
  }
  const entries = form.getAll("imageFiles");
  if (!entries.length || entries.length > MAX_IMAGE_COUNT || entries.some((entry) => typeof entry === "string")) {
    return relayJson(400, "invalid_request", "이미지는 1개 이상 10개 이하로 전송해 주세요.");
  }
  const files = entries as File[];
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += file.size;
    const extension = file.name.split(".").pop()?.toLowerCase();
    const extensionValid =
      (file.type === "image/jpeg" && ["jpg", "jpeg"].includes(extension ?? "")) ||
      (file.type === "image/png" && extension === "png");
    if (
      !IMAGE_TYPES.has(file.type) ||
      !extensionValid ||
      file.size < 1 ||
      file.size > MAX_IMAGE_BYTES ||
      totalBytes > MAX_IMAGE_TOTAL_BYTES
    ) {
      return relayJson(400, "invalid_image", "JPG·PNG 이미지만 파일당 10 MiB, 전체 50 MiB 이하로 전송할 수 있습니다.");
    }
  }
  return Promise.all(
    files.map(async (file, index) => ({
      name: `image-${index + 1}.${file.type === "image/png" ? "png" : "jpg"}`,
      type: file.type as NaverImageUploadFile["type"],
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );
}

function parseCategoryMetadataQuery(url: URL) {
  const parsed = relayCategoryMetadataQuerySchema.safeParse({
    categoryId: url.searchParams.get("categoryId") ?? undefined,
  });
  if (
    !parsed.success ||
    Array.from(url.searchParams.keys()).some((key) => key !== "categoryId")
  ) {
    return relayJson(400, "invalid_request", "카테고리 ID를 확인해 주세요.");
  }
  return parsed.data.categoryId;
}

async function handleCategories(url: URL, client: NaverCategoriesClient) {
  const parsed = relayQuerySchema.safeParse({
    last: url.searchParams.get("last") ?? undefined,
  });
  if (
    !parsed.success ||
    Array.from(url.searchParams.keys()).some((key) => key !== "last")
  )
    return relayJson(400, "invalid_request", "요청 조건이 올바르지 않습니다.");
  return client.fetchCategories({
    last:
      parsed.data.last === undefined ? undefined : parsed.data.last === "true",
  });
}

async function handleProductModels(url: URL, client: NaverCategoriesClient) {
  const parsed = relayProductModelQuerySchema.safeParse({
    name: url.searchParams.get("name") ?? undefined,
    size: url.searchParams.get("size") ?? undefined,
  });
  if (
    !parsed.success ||
    Array.from(url.searchParams.keys()).some(
      (key) => !["name", "size"].includes(key),
    )
  )
    return relayJson(400, "invalid_request", "요청 조건이 올바르지 않습니다.");
  return client.fetchProductModels(parsed.data.name, parsed.data.size);
}

function relayJson(
  status: number,
  code: string,
  message: string,
  invalidInputs: NaverCommerceError["invalidInputs"] = [],
) {
  return Response.json(
    { error: { code, message, invalidInputs } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

async function readRelayError(response: Response) {
  try {
    const parsed = z
      .object({
        error: z.object({
          code: z.string(),
          message: z.string().optional(),
          invalidInputs: z
            .array(
              z.object({
                name: z.string(),
                type: z.string().optional(),
                message: z.string(),
              }),
            )
            .optional(),
        }),
      })
      .safeParse(await response.clone().json());
    return parsed.success
      ? {
          ...parsed.data.error,
          invalidInputs: parsed.data.error.invalidInputs ?? [],
        }
      : undefined;
  } catch {
    return undefined;
  }
}
