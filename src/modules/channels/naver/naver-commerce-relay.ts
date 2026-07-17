import { z } from "zod";
import {
  NaverCommerceError,
  parseNaverCommerceCategories,
  parseNaverCommerceProductAttributes,
  parseNaverCommerceProductAttributeUnits,
  parseNaverCommerceProductAttributeValues,
  parseNaverCommerceProductModels,
  parseNaverCommerceStandardOptions,
  type NaverCommerceCategory,
  type NaverCommerceProductAttribute,
  type NaverCommerceProductAttributeUnit,
  type NaverCommerceProductAttributeValue,
  type NaverCommerceProductModel,
  type NaverCommerceStandardOptions,
} from "./naver-commerce-client";
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

  private async request(url: URL) {
    const timestamp = this.now();
    const nonce = this.createNonce();
    const pathAndQuery = `${url.pathname}${url.search}`;
    const signature = await createNaverRelaySignature(
      this.config.sharedSecret,
      { timestamp, nonce, method: "GET", pathAndQuery },
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetcher(url, {
        method: "GET",
        headers: {
          accept: "application/json;charset=UTF-8",
          [NAVER_RELAY_HEADERS.timestamp]: String(timestamp),
          [NAVER_RELAY_HEADERS.nonce]: nonce,
          [NAVER_RELAY_HEADERS.signature]: signature,
        },
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
        const code = await readRelayErrorCode(response);
        throw new NaverCommerceError(
          code === "relay_authentication_failed"
            ? "authentication_failed"
            : "request_failed",
          code === "relay_authentication_failed"
            ? "네이버 API 중계 서버 인증에 실패했습니다."
            : "네이버 API 중계 요청에 실패했습니다.",
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

const RELAY_PATHS = [
  "/v1/categories",
  "/v1/product-models",
  "/v1/product-attributes/attributes",
  "/v1/product-attributes/attribute-values",
  "/v1/product-attributes/attribute-value-units",
  "/v1/options/standard-options",
] as const;

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
    if (
      request.method !== "GET" ||
      !RELAY_PATHS.some((path) => path === url.pathname)
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

    const pathAndQuery = `${url.pathname}${url.search}`;
    const valid = await verifyNaverRelaySignature(
      options.sharedSecret,
      { timestamp, nonce, method: request.method, pathAndQuery },
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
      const result = await handleRelayRequest(url, options.client);
      if (result instanceof Response) return result;
      return Response.json(result, {
        headers: { "cache-control": "no-store" },
      });
    } catch (error) {
      if (error instanceof NaverCommerceError) {
        const status = error.code === "timeout" ? 504 : 502;
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

async function handleRelayRequest(url: URL, client: NaverCategoriesClient) {
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
  const categoryId = parseCategoryMetadataQuery(url);
  if (categoryId instanceof Response) return categoryId;
  if (url.pathname === "/v1/product-attributes/attributes")
    return client.fetchProductAttributes(categoryId);
  if (url.pathname === "/v1/product-attributes/attribute-values")
    return client.fetchProductAttributeValues(categoryId);
  return client.fetchStandardOptions(categoryId);
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

async function readRelayErrorCode(response: Response) {
  try {
    const parsed = z
      .object({ error: z.object({ code: z.string() }) })
      .safeParse(await response.clone().json());
    return parsed.success ? parsed.data.error.code : undefined;
  } catch {
    return undefined;
  }
}
