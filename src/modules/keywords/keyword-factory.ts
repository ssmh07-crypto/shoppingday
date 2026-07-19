import "server-only";
import { getServerEnv } from "@/lib/env/server";
import type { Database } from "@/lib/db";
import { KeywordManagementService } from "./keyword-service";
import { DrizzleKeywordManagementRepository } from "./keyword-repository";
import { MockKeywordGenerationClient } from "./mock-keyword-client";
import { MockKeywordMetricsClient } from "./mock-keyword-metrics-client";
import { NaverSearchAdClient } from "./naver-search-ad-client";
import { RulesKeywordClient } from "./rules-keyword-client";
import { isNaverCommerceConfigured, createConfiguredNaverClient } from "@/modules/channels/naver/naver-category-service";
import { NaverCategoryRepository } from "@/modules/channels/naver/naver-category-repository";
import { CommerceApiManagedProductImporter } from "./naver-product-importer";

export function createKeywordManagementService(database: Database) {
  const env = getServerEnv();
  const mock = env.USE_MOCK_EXTERNAL_APIS;
  const generator = mock
    ? new MockKeywordGenerationClient()
    : new RulesKeywordClient();
  const metrics = mock
    ? new MockKeywordMetricsClient()
    : env.NAVER_SEARCH_AD_API_KEY &&
        env.NAVER_SEARCH_AD_SECRET_KEY &&
        env.NAVER_SEARCH_AD_CUSTOMER_ID
      ? new NaverSearchAdClient({
          baseUrl: env.NAVER_SEARCH_AD_API_URL,
          apiKey: env.NAVER_SEARCH_AD_API_KEY,
          secretKey: env.NAVER_SEARCH_AD_SECRET_KEY,
          customerId: env.NAVER_SEARCH_AD_CUSTOMER_ID,
          timeoutMs: env.NAVER_SEARCH_AD_TIMEOUT_MS,
        })
      : null;
  const productImporter =
    !mock && isNaverCommerceConfigured(env)
      ? new CommerceApiManagedProductImporter(
          createConfiguredNaverClient(env),
          new NaverCategoryRepository(database),
        )
      : null;
  return new KeywordManagementService(
    new DrizzleKeywordManagementRepository(database),
    generator,
    metrics,
    {
      candidateCount: env.KEYWORD_CANDIDATE_COUNT,
      cacheHours: env.KEYWORD_METRICS_CACHE_HOURS,
      titleMaximumLength: env.GENERATED_TITLE_MAX_LENGTH,
      mockMode: mock,
    },
    productImporter,
  );
}

export function keywordRuntimeStatus() {
  const env = getServerEnv();
  return {
    mockMode: env.USE_MOCK_EXTERNAL_APIS,
    searchAdConfigured: Boolean(
      env.NAVER_SEARCH_AD_API_KEY &&
        env.NAVER_SEARCH_AD_SECRET_KEY &&
        env.NAVER_SEARCH_AD_CUSTOMER_ID,
    ),
    apiHubConfigured: Boolean(
      env.NAVER_API_HUB_CLIENT_ID && env.NAVER_API_HUB_CLIENT_SECRET,
    ),
  };
}
