import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import {
  NaverCommerceClient,
  type NaverCommerceConfig,
} from "@/modules/channels/naver/naver-commerce-client";

const config: NaverCommerceConfig = {
  apiUrl: "https://api.example.test/external",
  clientId: "test-client-id",
  clientSecret: bcrypt.genSaltSync(4),
  tokenType: "SELF",
  timeoutMs: 1000,
};

describe("네이버 판매자 태그", () => {
  it("태그사전의 추천 태그는 코드와 네이버 표준 표기로 등록한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "token",
          expires_in: 10800,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(
        Response.json([{ code: 1094599, text: "국산욕실화" }]),
      )
      .mockResolvedValueOnce(
        Response.json({
          originProductNo: 100000001,
          smartstoreChannelProductNo: 200000001,
        }),
      );
    const client = new NaverCommerceClient(
      config,
      fetcher,
      () => 1_752_700_000_000,
    );
    const payload = {
      originProduct: {
        detailAttribute: {
          seoInfo: { sellerTags: [{ text: "국산 욕실화" }] },
        },
      },
    } as never;

    await client.createProduct(payload);

    expect(String(fetcher.mock.calls[1]?.[0])).toContain(
      "/v2/tags/recommend-tags?keyword=",
    );
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({
      body: JSON.stringify({
        originProduct: {
          detailAttribute: {
            seoInfo: {
              sellerTags: [{ code: 1094599, text: "국산욕실화" }],
            },
          },
        },
      }),
    });
  });

  it("태그사전에 정확히 일치하지 않는 태그는 직접 태그로 유지한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          access_token: "token",
          expires_in: 10800,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(
        Response.json({
          originProductNo: 100000001,
          smartstoreChannelProductNo: 200000001,
        }),
      );
    const client = new NaverCommerceClient(
      config,
      fetcher,
      () => 1_752_700_000_000,
    );
    const payload = {
      originProduct: {
        detailAttribute: {
          seoInfo: { sellerTags: [{ text: "직접만든태그" }] },
        },
      },
    } as never;

    await client.createProduct(payload);

    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({
      body: JSON.stringify(payload),
    });
  });
});
