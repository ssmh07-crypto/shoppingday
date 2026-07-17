import bcrypt from "bcryptjs";
import { z } from "zod";

const tokenSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  token_type: z.string().min(1),
});

const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  wholeCategoryName: z.string().min(1),
  last: z.boolean(),
});

const categoriesSchema = z.array(categorySchema).min(1);

export type NaverCommerceCategory = z.infer<typeof categorySchema>;

export async function parseNaverCommerceCategories(response: Response) {
  const json = await parseJson(response);
  const parsed = categoriesSchema.safeParse(json);
  if (!parsed.success) {
    throw new NaverCommerceError(
      "invalid_response",
      "네이버 카테고리 응답 형식이 올바르지 않습니다.",
      response.status,
    );
  }
  return parsed.data;
}

export type NaverCommerceConfig = {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
  tokenType: "SELF" | "SELLER";
  accountId?: string;
  timeoutMs: number;
};

export class NaverCommerceError extends Error {
  constructor(
    readonly code:
      | "not_configured"
      | "ip_not_allowed"
      | "authentication_failed"
      | "request_failed"
      | "invalid_response"
      | "timeout",
    message: string,
    readonly responseStatus?: number,
  ) {
    super(message);
    this.name = "NaverCommerceError";
  }
}

export async function createNaverCommerceSignature(
  clientId: string,
  clientSecret: string,
  timestamp: number,
) {
  const hashed = await bcrypt.hash(`${clientId}_${timestamp}`, clientSecret);
  return Buffer.from(hashed, "utf8").toString("base64");
}

export class NaverCommerceClient {
  private token?: { value: string; expiresAt: number };

  constructor(
    private readonly config: NaverCommerceConfig,
    private readonly fetcher: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async fetchCategories(options: { last?: boolean } = {}) {
    const url = new URL(`${this.config.apiUrl}/v1/categories`);
    if (options.last !== undefined) {
      url.searchParams.set("last", String(options.last));
    }
    const response = await this.authorizedFetch(url);
    return parseNaverCommerceCategories(response);
  }

  private async authorizedFetch(url: URL) {
    const token = await this.getAccessToken();
    const response = await this.request(
      url,
      {
        method: "GET",
        headers: {
          accept: "application/json;charset=UTF-8",
          authorization: `Bearer ${token}`,
        },
      },
      true,
    );
    if (response.status !== 401) return response;

    this.token = undefined;
    const refreshedToken = await this.getAccessToken();
    return this.request(url, {
      method: "GET",
      headers: {
        accept: "application/json;charset=UTF-8",
        authorization: `Bearer ${refreshedToken}`,
      },
    });
  }

  private async getAccessToken() {
    const now = this.now();
    if (this.token && this.token.expiresAt - 60_000 > now) {
      return this.token.value;
    }

    const timestamp = now;
    const signature = await createNaverCommerceSignature(
      this.config.clientId,
      this.config.clientSecret,
      timestamp,
    );
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      timestamp: String(timestamp),
      grant_type: "client_credentials",
      client_secret_sign: signature,
      type: this.config.tokenType,
    });
    if (this.config.tokenType === "SELLER" && this.config.accountId) {
      body.set("account_id", this.config.accountId);
    }

    const response = await this.request(
      new URL(`${this.config.apiUrl}/v1/oauth2/token`),
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    const json = await parseJson(response);
    const parsed = tokenSchema.safeParse(json);
    if (!parsed.success) {
      throw new NaverCommerceError(
        "invalid_response",
        "네이버 인증 응답 형식이 올바르지 않습니다.",
        response.status,
      );
    }
    this.token = {
      value: parsed.data.access_token,
      expiresAt: now + parsed.data.expires_in * 1000,
    };
    return this.token.value;
  }

  private async request(
    url: URL,
    init: RequestInit,
    allowUnauthorized = false,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        ...init,
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
      });
      if (allowUnauthorized && response.status === 401) return response;
      if (response.status >= 300 && response.status < 400) {
        throw new NaverCommerceError(
          "request_failed",
          "네이버 커머스API가 예상하지 못한 리디렉션을 반환했습니다.",
          response.status,
        );
      }
      if (!response.ok) {
        const gatewayCode = await readGatewayErrorCode(response);
        if (gatewayCode === "GW.IP_NOT_ALLOWED") {
          throw new NaverCommerceError(
            "ip_not_allowed",
            "현재 서버의 공인 IP가 네이버 커머스API 호출 IP에 등록되지 않았습니다.",
            response.status,
          );
        }
        throw new NaverCommerceError(
          response.status === 401 || response.status === 403
            ? "authentication_failed"
            : "request_failed",
          response.status === 401 || response.status === 403
            ? "네이버 커머스API 인증 또는 권한을 확인해 주세요."
            : "네이버 커머스API 요청에 실패했습니다.",
          response.status,
        );
      }
      return response;
    } catch (error) {
      if (error instanceof NaverCommerceError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new NaverCommerceError(
          "timeout",
          "네이버 커머스API 응답 시간이 초과되었습니다.",
        );
      }
      throw new NaverCommerceError(
        "request_failed",
        "네이버 커머스API에 연결할 수 없습니다.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readGatewayErrorCode(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) return undefined;
  try {
    const body = (await response.clone().json()) as { code?: unknown };
    return typeof body.code === "string" ? body.code : undefined;
  } catch {
    return undefined;
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new NaverCommerceError(
      "invalid_response",
      "네이버 커머스API가 JSON이 아닌 응답을 반환했습니다.",
      response.status,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new NaverCommerceError(
      "invalid_response",
      "네이버 커머스API JSON 응답을 해석할 수 없습니다.",
      response.status,
    );
  }
}
