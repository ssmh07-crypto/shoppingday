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

const tokenResponse = () =>
  Response.json({
    access_token: "token",
    expires_in: 10800,
    token_type: "Bearer",
  });

const productResponse = () =>
  Response.json({
    originProductNo: 100000001,
    smartstoreChannelProductNo: 200000001,
  });

describe("네이버 판매자 태그", () => {
  it("이미 확인한 추천 태그 코드는 재조회하지 않고 그대로 사용한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(productResponse());
    const client = new NaverCommerceClient(
      config,
      fetcher,
      () => 1_752_700_000_000,
    );
    const payload = {
      originProduct: {
        detailAttribute: {
          seoInfo: {
            sellerTags: [{ code: 1094599, text: "국산욕실화" }],
          },
        },
      },
    } as never;

    await client.createProduct(payload);

    expect(String(fetcher.mock.calls[1]?.[0])).toContain("/v2/products");
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({
      body: JSON.stringify(payload),
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("태그사전의 정확 일치 태그는 코드와 표준 표기로 등록한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(
        Response.json([{ code: 1094599, text: "국산욕실화" }]),
      )
      .mockResolvedValueOnce(productResponse());
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

  it("태그사전에 없는 직접 입력 태그는 코드 없이 수정한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(productResponse());
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

    await client.updateProduct("100000001", payload);

    expect(String(fetcher.mock.calls[2]?.[0])).toContain(
      "/v2/products/origin-products/100000001",
    );
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({
      method: "PUT",
      body: JSON.stringify(payload),
    });
  });

  it("여러 태그는 네이버 초당 한도에 맞춰 순차 조회한다", async () => {
    let activeRequests = 0;
    let maxActiveRequests = 0;
    const wait = vi.fn().mockResolvedValue(undefined);
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/v1/oauth2/token")) return tokenResponse();
      if (url.includes("/v2/tags/recommend-tags")) {
        activeRequests += 1;
        maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
        await Promise.resolve();
        activeRequests -= 1;
        return Response.json([]);
      }
      return productResponse();
    });
    const client = new NaverCommerceClient(
      config,
      fetcher,
      () => 1_752_700_000_000,
      wait,
    );
    const payload = {
      originProduct: {
        detailAttribute: {
          seoInfo: {
            sellerTags: [
              { text: "태그하나" },
              { text: "태그둘" },
              { text: "태그셋" },
            ],
          },
        },
      },
    } as never;

    await client.createProduct(payload);

    expect(maxActiveRequests).toBe(1);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenNthCalledWith(1, 550);
    expect(wait).toHaveBeenNthCalledWith(2, 550);
    expect(String(fetcher.mock.calls[4]?.[0])).toContain("/v2/products");
  });
});
