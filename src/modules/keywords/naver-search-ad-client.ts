import "server-only";
import { z } from "zod";
import { chunkKeywords, normalizeKeyword, normalizeSearchVolume, sumSearchVolumes } from "./keyword-utils";
import { createNaverSearchAdSignature } from "./naver-search-ad-auth";
import type { KeywordCompetition, KeywordMetrics } from "./types";

const keywordToolRowSchema = z.object({
  relKeyword: z.string(),
  monthlyPcQcCnt: z.union([z.string(), z.number()]).nullable().optional(),
  monthlyMobileQcCnt: z.union([z.string(), z.number()]).nullable().optional(),
  compIdx: z.string().nullable().optional(),
});

const keywordToolResponseSchema = z.union([
  z.array(keywordToolRowSchema),
  z.object({ keywordList: z.array(keywordToolRowSchema) }),
]);

export class NaverSearchAdError extends Error {
  constructor(
    readonly code: "not_configured" | "unauthorized" | "forbidden" | "rate_limited" | "server_error" | "invalid_response" | "network_error",
    message: string,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "NaverSearchAdError";
  }
}

export interface NaverSearchAdClientOptions {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  customerId: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class NaverSearchAdClient {
  private readonly request: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly options: NaverSearchAdClientOptions) {
    this.request = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async fetchKeywordMetrics(keywords: string[]): Promise<KeywordMetrics[]> {
    const normalized = new Map(
      keywords.map((keyword) => [normalizeSearchAdKeyword(keyword), keyword]),
    );
    const found = new Map<string, KeywordMetrics>();
    for (const chunk of chunkKeywords(Array.from(normalized.values()), 5)) {
      const rows = await this.fetchChunk(chunk);
      for (const row of rows) {
        const originalKeyword = normalized.get(normalizeSearchAdKeyword(row.relKeyword));
        if (!originalKeyword) continue;
        found.set(
          normalizeSearchAdKeyword(originalKeyword),
          mapKeywordToolRow(originalKeyword, row, this.now()),
        );
      }
    }
    return keywords.map(
      (keyword) =>
        found.get(normalizeSearchAdKeyword(keyword)) ?? {
          keyword,
          monthlyPcSearchVolume: null,
          monthlyMobileSearchVolume: null,
          totalMonthlySearchVolume: null,
          rawMonthlyPcSearchVolume: null,
          rawMonthlyMobileSearchVolume: null,
          competition: "unknown",
          fetchedAt: new Date(this.now()).toISOString(),
          source: "naver-search-ad",
          status: "not-found",
        },
    );
  }

  async discoverKeywordMetrics(hintKeywords: string[], limit: number) {
    const found = new Map<string, KeywordMetrics>();
    for (const chunk of chunkKeywords(hintKeywords, 5)) {
      const rows = await this.fetchChunk(chunk);
      for (const row of rows) {
        const normalized = normalizeSearchAdKeyword(row.relKeyword);
        if (!normalized || found.has(normalized)) continue;
        found.set(normalized, mapKeywordToolRow(row.relKeyword, row, this.now()));
        if (found.size >= limit) return Array.from(found.values());
      }
    }
    return Array.from(found.values());
  }

  private async fetchChunk(keywords: string[]) {
    const uri = "/keywordstool";
    const url = new URL(uri, this.options.baseUrl);
    // 검색광고 키워드 도구는 공백이 포함된 hintKeywords를 11001로 거절할 수 있다.
    // 요청과 응답 매칭에서만 공백을 제거하고 UI/DB의 사용자 원문은 보존한다.
    url.searchParams.set(
      "hintKeywords",
      keywords.map(normalizeSearchAdKeyword).join(","),
    );
    url.searchParams.set("showDetail", "1");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const timestamp = String(this.now());
      const signature = await createNaverSearchAdSignature(
        timestamp,
        "GET",
        uri,
        this.options.secretKey,
      );
      let response: Response;
      try {
        response = await this.request(url, {
          headers: {
            "X-Timestamp": timestamp,
            "X-API-KEY": this.options.apiKey,
            "X-Customer": this.options.customerId,
            "X-Signature": signature,
          },
          signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
          cache: "no-store",
        });
      } catch (error) {
        if (attempt < 2) {
          await this.sleep(250 * 2 ** attempt);
          continue;
        }
        throw new NaverSearchAdError(
          "network_error",
          error instanceof Error && error.name === "TimeoutError"
            ? "네이버 검색광고 API 응답 시간이 초과되었습니다."
            : "네이버 검색광고 API에 연결하지 못했습니다.",
        );
      }
      if (response.ok) {
        const parsed = keywordToolResponseSchema.safeParse(await safeJson(response));
        if (!parsed.success) {
          throw new NaverSearchAdError(
            "invalid_response",
            "네이버 검색광고 API 응답 형식이 올바르지 않습니다.",
            response.status,
          );
        }
        return Array.isArray(parsed.data) ? parsed.data : parsed.data.keywordList;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        await this.sleep(250 * 2 ** attempt);
        continue;
      }
      throw statusError(response.status);
    }
    throw new NaverSearchAdError("server_error", "네이버 검색광고 API 요청에 실패했습니다.");
  }
}

function normalizeSearchAdKeyword(value: string) {
  return normalizeKeyword(value).replace(/\s+/g, "");
}

export function mapKeywordToolRow(
  keyword: string,
  row: z.infer<typeof keywordToolRowSchema>,
  now = Date.now(),
): KeywordMetrics {
  const pc = normalizeSearchVolume(row.monthlyPcQcCnt);
  const mobile = normalizeSearchVolume(row.monthlyMobileQcCnt);
  const total = sumSearchVolumes(pc, mobile);
  const success = total != null;
  return {
    keyword,
    monthlyPcSearchVolume: pc.normalized,
    monthlyMobileSearchVolume: mobile.normalized,
    totalMonthlySearchVolume: total,
    rawMonthlyPcSearchVolume: pc.raw,
    rawMonthlyMobileSearchVolume: mobile.raw,
    competition: mapCompetition(row.compIdx),
    fetchedAt: new Date(now).toISOString(),
    source: "naver-search-ad",
    status: success ? "success" : "error",
  };
}

function mapCompetition(value: string | null | undefined): KeywordCompetition {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "low" || normalized === "낮음") return "low";
  if (normalized === "medium" || normalized === "mid" || normalized === "중간") return "medium";
  if (normalized === "high" || normalized === "높음") return "high";
  return "unknown";
}

function statusError(status: number) {
  if (status === 401)
    return new NaverSearchAdError("unauthorized", "검색광고 API 인증값을 확인해 주세요.", status);
  if (status === 403)
    return new NaverSearchAdError("forbidden", "검색광고 API 사용 권한이 없습니다.", status);
  if (status === 429)
    return new NaverSearchAdError("rate_limited", "검색광고 API 호출 한도를 초과했습니다.", status);
  if (status >= 500)
    return new NaverSearchAdError("server_error", "네이버 검색광고 API 서버 오류입니다.", status);
  return new NaverSearchAdError("invalid_response", "네이버 검색광고 API 요청이 거절되었습니다.", status);
}

async function safeJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}
