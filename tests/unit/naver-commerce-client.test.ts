import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";
import {
  createNaverCommerceSignature,
  NaverCommerceClient,
  type NaverCommerceConfig,
} from "@/modules/channels/naver/naver-commerce-client";

const clientId = "test-client-id";
const clientSecret = bcrypt.genSaltSync(4);
const now = 1_752_700_000_000;
const config: NaverCommerceConfig = {
  apiUrl: "https://api.example.test/external",
  clientId,
  clientSecret,
  tokenType: "SELF",
  timeoutMs: 1000,
};
const categories = [
  {
    id: "50000000",
    name: "패션의류",
    wholeCategoryName: "패션의류",
    last: false,
  },
  {
    id: "50000805",
    name: "원피스",
    wholeCategoryName: "패션의류>여성의류>원피스",
    last: true,
  },
];

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json;charset=UTF-8" },
  });
}

describe("네이버 커머스API 클라이언트", () => {
  it("공식 bcrypt+Base64 방식으로 전자서명을 만든다", async () => {
    const signature = await createNaverCommerceSignature(
      clientId,
      clientSecret,
      now,
    );
    const decoded = Buffer.from(signature, "base64").toString("utf8");
    await expect(bcrypt.compare(`${clientId}_${now}`, decoded)).resolves.toBe(
      true,
    );
  });

  it("토큰을 캐시하고 인증정보를 URL과 헤더에 노출하지 않는다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          access_token: "access-token",
          expires_in: 10800,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(json(categories))
      .mockResolvedValueOnce(json(categories));
    const client = new NaverCommerceClient(config, fetcher, () => now);

    await client.fetchCategories();
    await client.fetchCategories({ last: true });

    expect(fetcher).toHaveBeenCalledTimes(3);
    const [tokenUrl, tokenInit] = fetcher.mock.calls[0];
    expect(String(tokenUrl)).toBe(
      "https://api.example.test/external/v1/oauth2/token",
    );
    expect(String(tokenUrl)).not.toContain(clientId);
    expect(JSON.stringify(tokenInit?.headers)).not.toContain(clientSecret);
    const body = new URLSearchParams(String(tokenInit?.body));
    expect(body.get("client_id")).toBe(clientId);
    expect(body.get("timestamp")).toBe(String(now));
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(String(fetcher.mock.calls[2]?.[0])).toContain("last=true");
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      authorization: "Bearer access-token",
    });
  });

  it("401이면 토큰을 폐기하고 한 번만 다시 인증한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          access_token: "expired",
          expires_in: 10800,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(json({ message: "expired" }, 401))
      .mockResolvedValueOnce(
        json({
          access_token: "fresh",
          expires_in: 10800,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(json(categories));

    await expect(
      new NaverCommerceClient(config, fetcher, () => now).fetchCategories(),
    ).resolves.toEqual(categories);
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[3]?.[1]?.headers).toMatchObject({
      authorization: "Bearer fresh",
    });
  });

  it("허용되지 않은 호출 IP 오류를 구체적으로 안내한다", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      json(
        {
          code: "GW.IP_NOT_ALLOWED",
          message: "호출이 허용되지 않은 IP입니다.",
        },
        403,
      ),
    );
    await expect(
      new NaverCommerceClient(config, fetcher, () => now).fetchCategories(),
    ).rejects.toMatchObject({
      code: "ip_not_allowed",
      responseStatus: 403,
    });
  });

  it("응답 형식이 잘못되면 안전하게 거부한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          access_token: "token",
          expires_in: 10800,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(json([]));
    await expect(
      new NaverCommerceClient(config, fetcher, () => now).fetchCategories(),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });
});
