import { z } from "zod";
import {
  NaverCommerceError,
  parseNaverCommerceCategories,
  type NaverCommerceCategory,
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
    const base = this.config.relayUrl.endsWith("/")
      ? this.config.relayUrl
      : `${this.config.relayUrl}/`;
    const url = new URL("v1/categories", base);
    if (options.last !== undefined) {
      url.searchParams.set("last", String(options.last));
    }

    const response = await this.requestWithRetry(url);
    return parseNaverCommerceCategories(response);
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
    if (request.method !== "GET" || url.pathname !== "/v1/categories") {
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

    const parsedQuery = relayQuerySchema.safeParse({
      last: url.searchParams.get("last") ?? undefined,
    });
    if (
      !parsedQuery.success ||
      Array.from(url.searchParams.keys()).some((key) => key !== "last")
    ) {
      return relayJson(
        400,
        "invalid_request",
        "요청 조건이 올바르지 않습니다.",
      );
    }

    try {
      const categories = await options.client.fetchCategories({
        last:
          parsedQuery.data.last === undefined
            ? undefined
            : parsedQuery.data.last === "true",
      });
      return Response.json(categories, {
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
