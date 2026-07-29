import "server-only";
import { z } from "zod";

const trendResponseSchema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  timeUnit: z.enum(["date", "week", "month"]),
  results: z.array(
    z.object({
      title: z.string(),
      keyword: z.array(z.string()),
      data: z.array(z.object({ period: z.string(), ratio: z.number().nonnegative() })),
    }),
  ),
});

export interface ShoppingKeywordTrendRequest {
  startDate: string;
  endDate: string;
  timeUnit: "date" | "week" | "month";
  categoryId: string;
  keywords: string[];
  device?: "pc" | "mo";
  gender?: "m" | "f";
  ages?: Array<"10" | "20" | "30" | "40" | "50" | "60">;
}

export class NaverApiHubClient {
  constructor(
    private readonly options: {
      baseUrl: string;
      clientId: string;
      clientSecret: string;
      fetch?: typeof fetch;
      timeoutMs?: number;
    },
  ) {}

  async fetchShoppingKeywordTrends(input: ShoppingKeywordTrendRequest) {
    if (!input.keywords.length || input.keywords.length > 5) {
      throw new Error("NAVER API HUB 쇼핑 인사이트 키워드는 1~5개여야 합니다.");
    }
    const response = await (this.options.fetch ?? fetch)(
      new URL("/shopping/v1/category/keywords", this.options.baseUrl),
      {
        method: "POST",
        headers: {
          "X-NCP-APIGW-API-KEY-ID": this.options.clientId,
          "X-NCP-APIGW-API-KEY": this.options.clientSecret,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: input.startDate,
          endDate: input.endDate,
          timeUnit: input.timeUnit,
          category: input.categoryId,
          keyword: input.keywords.map((keyword) => ({ name: keyword, param: [keyword] })),
          device: input.device,
          gender: input.gender,
          ages: input.ages,
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 15_000),
        cache: "no-store",
      },
    );
    if (!response.ok) {
      throw new Error(
        response.status === 429
          ? "NAVER API HUB 호출 한도를 초과했습니다."
          : "NAVER API HUB 쇼핑 인사이트 조회에 실패했습니다.",
      );
    }
    const parsed = trendResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error("NAVER API HUB 응답 형식이 올바르지 않습니다.");
    return parsed.data;
  }
}

