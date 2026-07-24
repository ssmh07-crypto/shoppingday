import "server-only";
import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

// `.env.local` templates commonly keep optional settings as empty strings.
// Treat those as unset so unused integrations (such as R2 in the current
// URL-only image flow) do not prevent the application from starting.
const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.url().optional(),
);

const serverEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    SUPABASE_SERVICE_ROLE_KEY: optionalString,
    DATABASE_URL: z.string().min(1),
    DOME_API_URL: z
      .url()
      .default("https://79dome.com/Api/ProductSelect_Api_UTF8.php"),
    DOME_API_ID: optionalString,
    DOME_API_KEY: optionalString,
    DOME_API_MOCK_MODE: booleanString,
    DOME_API_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60_000)
      .default(10_000),
    DOME_API_MAX_RESPONSE_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(20 * 1024 * 1024)
      .default(5 * 1024 * 1024),
    R2_ACCOUNT_ID: optionalString,
    R2_ACCESS_KEY_ID: optionalString,
    R2_SECRET_ACCESS_KEY: optionalString,
    R2_BUCKET_NAME: optionalString,
    R2_PUBLIC_BASE_URL: optionalUrl,
    GITHUB_ACTIONS_TOKEN: optionalString,
    GITHUB_ACTIONS_REPOSITORY: optionalString,
    GITHUB_ACTIONS_WORKFLOW: optionalString,
    NAVER_COMMERCE_API_URL: z
      .url()
      .default("https://api.commerce.naver.com/external"),
    NAVER_COMMERCE_CLIENT_ID: optionalString,
    NAVER_COMMERCE_CLIENT_SECRET: optionalString,
    NAVER_COMMERCE_TOKEN_TYPE: z.enum(["SELF", "SELLER"]).default("SELF"),
    NAVER_COMMERCE_ACCOUNT_ID: optionalString,
    NAVER_COMMERCE_RELAY_URL: optionalUrl,
    NAVER_COMMERCE_RELAY_URL_OVERRIDE: optionalUrl,
    NAVER_COMMERCE_RELAY_SHARED_SECRET: optionalString,
    NAVER_COMMERCE_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60_000)
      .default(15_000),
    USE_MOCK_EXTERNAL_APIS: booleanString,
    NAVER_SEARCH_AD_API_URL: z
      .url()
      .default("https://api.searchad.naver.com"),
    NAVER_SEARCH_AD_API_KEY: optionalString,
    NAVER_SEARCH_AD_SECRET_KEY: optionalString,
    NAVER_SEARCH_AD_CUSTOMER_ID: optionalString,
    NAVER_SEARCH_AD_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(1000)
      .max(60_000)
      .default(15_000),
    NAVER_API_HUB_BASE_URL: z
      .url()
      .default("https://naverapihub.apigw.ntruss.com"),
    NAVER_API_HUB_CLIENT_ID: optionalString,
    NAVER_API_HUB_CLIENT_SECRET: optionalString,
    KEYWORD_METRICS_CACHE_HOURS: z.coerce
      .number()
      .int()
      .min(1)
      .max(24 * 30)
      .default(24),
    KEYWORD_CANDIDATE_COUNT: z.coerce
      .number()
      .int()
      .min(10)
      .max(50)
      .default(30),
    GENERATED_TITLE_MAX_LENGTH: z.coerce
      .number()
      .int()
      .min(20)
      .max(100)
      .default(60),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production" && env.USE_MOCK_EXTERNAL_APIS) {
      ctx.addIssue({
        code: "custom",
        path: ["USE_MOCK_EXTERNAL_APIS"],
        message: "USE_MOCK_EXTERNAL_APIS cannot be enabled in production",
      });
    }
    if (!env.DOME_API_MOCK_MODE && (!env.DOME_API_ID || !env.DOME_API_KEY)) {
      ctx.addIssue({
        code: "custom",
        path: ["DOME_API_ID"],
        message: "DOME_API_ID and DOME_API_KEY are required outside mock mode",
      });
    }
    if (
      Boolean(env.NAVER_COMMERCE_CLIENT_ID) !==
      Boolean(env.NAVER_COMMERCE_CLIENT_SECRET)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["NAVER_COMMERCE_CLIENT_ID"],
        message:
          "NAVER_COMMERCE_CLIENT_ID and NAVER_COMMERCE_CLIENT_SECRET must be configured together",
      });
    }
    if (
      env.NAVER_COMMERCE_CLIENT_ID &&
      env.NAVER_COMMERCE_TOKEN_TYPE === "SELLER" &&
      !env.NAVER_COMMERCE_ACCOUNT_ID
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["NAVER_COMMERCE_ACCOUNT_ID"],
        message: "NAVER_COMMERCE_ACCOUNT_ID is required for SELLER token type",
      });
    }
    if (
      Boolean(
        env.NAVER_COMMERCE_RELAY_URL_OVERRIDE ?? env.NAVER_COMMERCE_RELAY_URL,
      ) !==
      Boolean(env.NAVER_COMMERCE_RELAY_SHARED_SECRET)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["NAVER_COMMERCE_RELAY_URL"],
        message:
          "a Naver relay URL and NAVER_COMMERCE_RELAY_SHARED_SECRET must be configured together",
      });
    }
    if (
      env.NAVER_COMMERCE_RELAY_SHARED_SECRET &&
      env.NAVER_COMMERCE_RELAY_SHARED_SECRET.length < 32
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["NAVER_COMMERCE_RELAY_SHARED_SECRET"],
        message:
          "NAVER_COMMERCE_RELAY_SHARED_SECRET must be at least 32 characters",
      });
    }
    const searchAdCredentials = [
      env.NAVER_SEARCH_AD_API_KEY,
      env.NAVER_SEARCH_AD_SECRET_KEY,
      env.NAVER_SEARCH_AD_CUSTOMER_ID,
    ].filter(Boolean).length;
    if (searchAdCredentials !== 0 && searchAdCredentials !== 3) {
      ctx.addIssue({
        code: "custom",
        path: ["NAVER_SEARCH_AD_API_KEY"],
        message:
          "NAVER_SEARCH_AD_API_KEY, NAVER_SEARCH_AD_SECRET_KEY and NAVER_SEARCH_AD_CUSTOMER_ID must be configured together",
      });
    }
    if (
      Boolean(env.NAVER_API_HUB_CLIENT_ID) !==
      Boolean(env.NAVER_API_HUB_CLIENT_SECRET)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["NAVER_API_HUB_CLIENT_ID"],
        message:
          "NAVER_API_HUB_CLIENT_ID and NAVER_API_HUB_CLIENT_SECRET must be configured together",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse(process.env);
  return cached;
}

export function resetEnvCacheForTests() {
  cached = undefined;
}
