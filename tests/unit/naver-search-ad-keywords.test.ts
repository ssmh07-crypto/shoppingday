import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createNaverSearchAdSignature } from "@/modules/keywords/naver-search-ad-auth";
import {
  mapKeywordToolRow,
  NaverSearchAdClient,
  NaverSearchAdError,
} from "@/modules/keywords/naver-search-ad-client";

const options = {
  baseUrl: "https://api.searchad.naver.com",
  apiKey: "api-key",
  secretKey: "secret-key",
  customerId: "123456",
  timeoutMs: 1_000,
  now: () => 1_700_000_000_000,
};

describe("네이버 검색광고 키워드 도구", () => {
  it("공식 timestamp.method.uri 형식으로 HMAC-SHA256 서명을 만든다", async () => {
    const expected = createHmac("sha256", options.secretKey)
      .update("1700000000000.GET./keywordstool")
      .digest("base64");
    await expect(
      createNaverSearchAdSignature(
        "1700000000000",
        "get",
        "/keywordstool",
        options.secretKey,
      ),
    ).resolves.toBe(expected);
  });

  it("공식 응답 필드를 내부 표준 모델로 변환하고 원문 범위를 보존한다", () => {
    expect(
      mapKeywordToolRow("여성 원피스", {
        relKeyword: "여성원피스",
        monthlyPcQcCnt: "< 10",
        monthlyMobileQcCnt: 1_200,
        compIdx: "높음",
      }),
    ).toMatchObject({
      keyword: "여성 원피스",
      monthlyPcSearchVolume: 9,
      monthlyMobileSearchVolume: 1_200,
      totalMonthlySearchVolume: 1_209,
      rawMonthlyPcSearchVolume: "< 10",
      rawMonthlyMobileSearchVolume: 1_200,
      competition: "high",
      source: "naver-search-ad",
      status: "success",
    });
  });

  it("5개 단위로 조회하고 API가 반환하지 않은 키워드는 not-found로 둔다", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      Response.json({
        keywordList: [
          {
            relKeyword: "여성원피스",
            monthlyPcQcCnt: 10,
            monthlyMobileQcCnt: 20,
            compIdx: "LOW",
          },
        ],
      }),
    );
    const client = new NaverSearchAdClient({ ...options, fetch: fetcher });
    const result = await client.fetchKeywordMetrics([
      "여성 원피스",
      "키워드2",
      "키워드3",
      "키워드4",
      "키워드5",
      "키워드6",
    ]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(result[0]).toMatchObject({
      keyword: "여성 원피스",
      totalMonthlySearchVolume: 30,
      status: "success",
    });
    expect(result[1]).toMatchObject({ keyword: "키워드2", status: "not-found" });
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      "X-Timestamp": "1700000000000",
      "X-API-KEY": "api-key",
      "X-Customer": "123456",
      "X-Signature": expect.any(String),
    });
    expect(String(fetcher.mock.calls[0]?.[0])).toContain(
      "hintKeywords=%EC%97%AC%EC%84%B1%EC%9B%90%ED%94%BC%EC%8A%A4",
    );
  });

  it("네이버가 반환한 연관 키워드를 응답 순서대로 확장한다", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        keywordList: [
          {
            relKeyword: "원피스",
            monthlyPcQcCnt: 100,
            monthlyMobileQcCnt: 900,
            compIdx: "HIGH",
          },
          {
            relKeyword: "여름원피스",
            monthlyPcQcCnt: "< 10",
            monthlyMobileQcCnt: 80,
            compIdx: "LOW",
          },
        ],
      }),
    );
    const client = new NaverSearchAdClient({ ...options, fetch: fetcher });
    await expect(client.discoverKeywordMetrics(["원피스"], 10)).resolves.toMatchObject([
      { keyword: "원피스", totalMonthlySearchVolume: 1_000 },
      { keyword: "여름원피스", totalMonthlySearchVolume: 89 },
    ]);
  });

  it("429를 최대 두 번만 백오프 후 명확한 오류로 반환한다", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, { status: 429 }),
    );
    const sleep = vi.fn().mockResolvedValue(undefined);
    const client = new NaverSearchAdClient({ ...options, fetch: fetcher, sleep });
    await expect(client.fetchKeywordMetrics(["원피스"])).rejects.toMatchObject({
      code: "rate_limited",
      httpStatus: 429,
    } satisfies Partial<NaverSearchAdError>);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 250);
    expect(sleep).toHaveBeenNthCalledWith(2, 500);
  });
});
