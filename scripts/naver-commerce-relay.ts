import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { NaverCommerceClient } from "../src/modules/channels/naver/naver-commerce-client";
import { createNaverCommerceRelayHandler } from "../src/modules/channels/naver/naver-commerce-relay";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const relayEnv = z
  .object({
    NAVER_RELAY_HOST: z.string().default("127.0.0.1"),
    NAVER_RELAY_PORT: z.coerce.number().int().min(1).max(65_535).default(8788),
    NAVER_COMMERCE_API_URL: z
      .url()
      .default("https://api.commerce.naver.com/external"),
    NAVER_COMMERCE_CLIENT_ID: z.string().min(1),
    NAVER_COMMERCE_CLIENT_SECRET: z.string().min(1),
    NAVER_COMMERCE_TOKEN_TYPE: z.enum(["SELF", "SELLER"]).default("SELF"),
    NAVER_COMMERCE_ACCOUNT_ID: optionalString,
    NAVER_COMMERCE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60_000)
      .default(15_000),
    NAVER_COMMERCE_RELAY_SHARED_SECRET: z.string().min(32),
    NAVER_RELAY_MAX_CLOCK_SKEW_MS: z.coerce
      .number()
      .int()
      .min(30_000)
      .max(10 * 60_000)
      .default(5 * 60_000),
  })
  .superRefine((env, ctx) => {
    if (
      env.NAVER_COMMERCE_TOKEN_TYPE === "SELLER" &&
      !env.NAVER_COMMERCE_ACCOUNT_ID
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["NAVER_COMMERCE_ACCOUNT_ID"],
        message: "NAVER_COMMERCE_ACCOUNT_ID is required for SELLER token type",
      });
    }
  })
  .parse(process.env);

const naverClient = new NaverCommerceClient({
  apiUrl: relayEnv.NAVER_COMMERCE_API_URL,
  clientId: relayEnv.NAVER_COMMERCE_CLIENT_ID,
  clientSecret: relayEnv.NAVER_COMMERCE_CLIENT_SECRET,
  tokenType: relayEnv.NAVER_COMMERCE_TOKEN_TYPE,
  accountId: relayEnv.NAVER_COMMERCE_ACCOUNT_ID,
  timeoutMs: relayEnv.NAVER_COMMERCE_TIMEOUT_MS,
});
const relayHandler = createNaverCommerceRelayHandler({
  sharedSecret: relayEnv.NAVER_COMMERCE_RELAY_SHARED_SECRET,
  client: naverClient,
  maxClockSkewMs: relayEnv.NAVER_RELAY_MAX_CLOCK_SKEW_MS,
});

const server = createServer(async (incoming, outgoing) => {
  const startedAt = Date.now();
  const requestId = randomUUID();
  let status = 500;
  const requestUrl = new URL(incoming.url ?? "/", "http://relay.local");

  try {
    if (incoming.method === "GET" && requestUrl.pathname === "/healthz") {
      status = 200;
      outgoing.writeHead(status, {
        "content-type": "application/json;charset=UTF-8",
        "cache-control": "no-store",
      });
      outgoing.end(JSON.stringify({ status: "ok" }));
      return;
    }

    const headers = new Headers();
    for (const [name, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(name, item);
      } else if (value !== undefined) {
        headers.set(name, value);
      }
    }
    const request = new Request(requestUrl, {
      method: incoming.method,
      headers,
    });
    const response = await relayHandler(request);
    status = response.status;
    const responseHeaders = Object.fromEntries(response.headers.entries());
    outgoing.writeHead(status, responseHeaders);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    status = 500;
    outgoing.writeHead(status, {
      "content-type": "application/json;charset=UTF-8",
      "cache-control": "no-store",
    });
    outgoing.end(
      JSON.stringify({
        error: {
          code: "internal_error",
          message: "중계 요청을 처리하지 못했습니다.",
        },
      }),
    );
  } finally {
    console.info(
      JSON.stringify({
        event: "naver_relay_request",
        requestId,
        method: incoming.method,
        path: requestUrl.pathname,
        status,
        durationMs: Date.now() - startedAt,
      }),
    );
  }
});

server.listen(relayEnv.NAVER_RELAY_PORT, relayEnv.NAVER_RELAY_HOST, () => {
  console.info(
    JSON.stringify({
      event: "naver_relay_started",
      host: relayEnv.NAVER_RELAY_HOST,
      port: relayEnv.NAVER_RELAY_PORT,
    }),
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
