import { describe, expect, it, vi } from "vitest";
import {
  createNaverCommerceRelayHandler,
  NaverCommerceRelayClient,
} from "@/modules/channels/naver/naver-commerce-relay";
import {
  createNaverRelaySignature,
  NAVER_RELAY_HEADERS,
  verifyNaverRelaySignature,
} from "@/modules/channels/naver/naver-relay-auth";

const now = 1_752_700_000_000;
const sharedSecret = "test-shared-secret-that-is-at-least-32-characters";
const nonce = "fixed-nonce-123456";
const categories = [
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

async function signedRequest(path = "/v1/categories") {
  const signature = await createNaverRelaySignature(sharedSecret, {
    timestamp: now,
    nonce,
    method: "GET",
    pathAndQuery: path,
  });
  return new Request(`https://relay.example.test${path}`, {
    headers: {
      [NAVER_RELAY_HEADERS.timestamp]: String(now),
      [NAVER_RELAY_HEADERS.nonce]: nonce,
      [NAVER_RELAY_HEADERS.signature]: signature,
    },
  });
}

describe("네이버 커머스API 중계 인증", () => {
  it("요청 경로와 본문까지 포함한 HMAC 서명을 검증한다", async () => {
    const input = {
      timestamp: now,
      nonce,
      method: "GET",
      pathAndQuery: "/v1/categories?last=true",
    };
    const signature = await createNaverRelaySignature(sharedSecret, input);

    await expect(
      verifyNaverRelaySignature(sharedSecret, input, signature),
    ).resolves.toBe(true);
    await expect(
      verifyNaverRelaySignature(
        sharedSecret,
        { ...input, pathAndQuery: "/v1/categories?last=false" },
        signature,
      ),
    ).resolves.toBe(false);
  });

  it("유효한 요청만 허용하고 같은 nonce의 재전송을 거부한다", async () => {
    const client = { fetchCategories: vi.fn().mockResolvedValue(categories) };
    const handler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now,
    });

    const response = await handler(
      await signedRequest("/v1/categories?last=true"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(categories);
    expect(client.fetchCategories).toHaveBeenCalledWith({ last: true });

    const replay = await handler(
      await signedRequest("/v1/categories?last=true"),
    );
    expect(replay.status).toBe(401);
    expect(client.fetchCategories).toHaveBeenCalledTimes(1);
  });

  it("서명 시간이 허용 범위를 벗어나면 네이버를 호출하지 않는다", async () => {
    const client = { fetchCategories: vi.fn() };
    const handler = createNaverCommerceRelayHandler({
      sharedSecret,
      client,
      now: () => now + 5 * 60_000 + 1,
    });

    const response = await handler(await signedRequest());
    expect(response.status).toBe(401);
    expect(client.fetchCategories).not.toHaveBeenCalled();
  });
});

describe("네이버 커머스API 중계 클라이언트", () => {
  it("네이버 인증정보 없이 서명된 요청을 보내고 응답을 검증한다", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(categories));
    const client = new NaverCommerceRelayClient(
      {
        relayUrl: "https://relay.example.test",
        sharedSecret,
        timeoutMs: 1000,
      },
      fetcher,
      () => now,
      () => nonce,
    );

    await expect(client.fetchCategories({ last: true })).resolves.toEqual(
      categories,
    );
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe(
      "https://relay.example.test/v1/categories?last=true",
    );
    expect(init?.headers).toMatchObject({
      [NAVER_RELAY_HEADERS.timestamp]: String(now),
      [NAVER_RELAY_HEADERS.nonce]: nonce,
    });
    expect(JSON.stringify(init)).not.toContain("client_secret");
  });

  it("일시적인 503 응답은 새 서명으로 한 번 재시도한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ error: { code: "unavailable" } }, 503))
      .mockResolvedValueOnce(json(categories));
    const wait = vi.fn().mockResolvedValue(undefined);
    let nonceCounter = 0;
    const client = new NaverCommerceRelayClient(
      {
        relayUrl: "https://relay.example.test",
        sharedSecret,
        timeoutMs: 1000,
      },
      fetcher,
      () => now,
      () => `retry-nonce-${String(++nonceCounter).padStart(8, "0")}`,
      wait,
    );

    await expect(client.fetchCategories()).resolves.toEqual(categories);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledWith(150);
    const firstHeaders = fetcher.mock.calls[0]?.[1]?.headers;
    const secondHeaders = fetcher.mock.calls[1]?.[1]?.headers;
    expect(firstHeaders).not.toEqual(secondHeaders);
  });
});
