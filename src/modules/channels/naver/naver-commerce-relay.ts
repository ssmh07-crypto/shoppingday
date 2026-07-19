import { z } from "zod";
import {
  NaverCommerceError,
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
  type NaverImageUploadFile,
} from "./naver-commerce-client";
import type { NaverProductPayload } from "./naver-product-payload";
import {
  createNaverRelaySignature,
  NAVER_RELAY_HEADERS,
  verifyNaverRelaySignature,
} from "./naver-relay-auth";

export type NaverCommerceRelayConfig = {
  relayUrl: string;
  sharedSecret: string;
  timeoutMs: number;
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
  fetchChannelProduct(channelProductNo: string): Promise<NaverCommerceChannelProduct>;
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
      method?: "GET" | "POST";
      body?: Uint8Array;
      contentType?: string;
    } = {},
  ) {
    const timestamp = this.now();
    const nonce = this.createNonce();
    const pathAndQuery = `${url.pathname}${url.search}`;
    const method = options.method ?? "GET";
    const signature = await createNaverRelaySignature(
      this.config.sharedSecret,
      { timestamp, nonce, method, pathAndQuery, body: options.body },
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetcher(url, {
        method,
        headers: {
          accept: "application/json;charset=UTF-8",
          ...(options.contentType ? { "content-type": options.contentType } : {}),
          [NAVER_RELAY_HEADERS.timestamp]: String(timestamp),
          [NAVER_RELAY_HEADERS.nonce]: nonce,
          [NAVER_RELAY_HEADERS.signature]: signature,
        },
        ...(options.body
          ? { body: new Blob([options.body as BlobPart]) }
          : {}),
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
      });
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
        );
      }
      return response;
    } catch (error) {
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
    }
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
const providedNoticeTypeSchema = z.string().regex(/^[A-Z_]{2,40}$/);
const naverImageUrlSchema = z.url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "shop-phinf.pstatic.net";
});
const productCreateSchema = z.looseObject({
  originProduct: z.looseObject({
    statusType: z.literal("SALE"),
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

const RELAY_PATHS = [
  "/v1/categories",
  "/v1/product-models",
  "/v1/product-attributes/attributes",
  "/v1/product-attributes/attribute-values",
  "/v1/product-attributes/attribute-value-units",
  "/v1/options/standard-options",
  "/v1/products-for-provided-notice",
] as const;
const IMAGE_UPLOAD_PATH = "/v1/product-images/upload";
const PRODUCT_CREATE_PATH = "/v2/products";
const CHANNEL_PRODUCT_PATH = /^\/v2\/products\/channel-products\/(\d{1,20})$/;
const MAX_PRODUCT_BODY_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_COUNT = 10;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_TOTAL_BYTES = 50 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

export type NaverRelayHandlerOptions = {
  sharedSecret: string;
  client: NaverCategoriesClient;
  now?: () => number;
  replayGuard?: NaverRelayReplayGuard;
  maxClockSkewMs?: number;
};

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
        CHANNEL_PRODUCT_PATH.test(url.pathname));
    const isImageUpload =
      request.method === "POST" && url.pathname === IMAGE_UPLOAD_PATH;
    const isProductCreate =
      request.method === "POST" && url.pathname === PRODUCT_CREATE_PATH;
    if (!isReadRequest && !isImageUpload && !isProductCreate) {
      return relayJson(
        404,
        "relay_route_not_found",
        "지원하지 않는 요청입니다.",
      );
    }

    const timestampHeader = request.headers.get(NAVER_RELAY_HEADERS.timestamp);
    const nonce = request.headers.get(NAVER_RELAY_HEADERS.nonce) ?? "";
    const signature = request.headers.get(NAVER_RELAY_HEADERS.signature) ?? "";
    const timestamp = Number(timestampHeader);
    if (
      !timestampHeader ||
      !Number.isSafeInteger(timestamp) ||
      Math.abs(now() - timestamp) > maxClockSkewMs ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)
    ) {
      return relayJson(
        401,
        "relay_authentication_failed",
        "중계 요청 인증정보가 올바르지 않습니다.",
      );
    }

    const body = isImageUpload || isProductCreate
      ? new Uint8Array(await request.arrayBuffer())
      : undefined;
    if (
      body &&
      ((isImageUpload && body.byteLength > MAX_IMAGE_TOTAL_BYTES + 1024 * 1024) ||
        (isProductCreate && body.byteLength > MAX_PRODUCT_BODY_BYTES))
    ) {
      return relayJson(413, "payload_too_large", "중계 요청 본문이 너무 큽니다.");
    }
    const pathAndQuery = `${url.pathname}${url.search}`;
    const valid = await verifyNaverRelaySignature(
      options.sharedSecret,
      { timestamp, nonce, method: request.method, pathAndQuery, body },
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
      const result = await handleRelayRequest(url, options.client, request, body);
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
        return relayJson(status, error.code, error.message);
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
) {
  const channelProductMatch = CHANNEL_PRODUCT_PATH.exec(url.pathname);
  if (channelProductMatch) {
    if (url.search) {
      return relayJson(400, "invalid_request", "채널 상품 조회에는 검색 조건을 사용할 수 없습니다.");
    }
    return client.fetchChannelProduct(channelProductMatch[1]!);
  }
  if (url.pathname === PRODUCT_CREATE_PATH) {
    if (
      url.search ||
      !body ||
      !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")
    ) {
      return relayJson(400, "invalid_request", "상품 등록 요청이 올바르지 않습니다.");
    }
    let input: unknown;
    try {
      input = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return relayJson(400, "invalid_request", "상품 등록 JSON을 해석할 수 없습니다.");
    }
    const parsed = productCreateSchema.safeParse(input);
    if (!parsed.success) {
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

function relayJson(status: number, code: string, message: string) {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

async function readRelayError(response: Response) {
  try {
    const parsed = z
      .object({
        error: z.object({ code: z.string(), message: z.string().optional() }),
      })
      .safeParse(await response.clone().json());
    return parsed.success ? parsed.data.error : undefined;
  } catch {
    return undefined;
  }
}
