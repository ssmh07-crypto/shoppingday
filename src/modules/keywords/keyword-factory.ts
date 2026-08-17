import "server-only";
import { getServerEnv } from "@/lib/env/server";
import type { Database } from "@/lib/db";
import { KeywordManagementService } from "./keyword-service";
import { DrizzleKeywordManagementRepository } from "./keyword-repository";
import { MockKeywordGenerationClient } from "./mock-keyword-client";
import { MockKeywordMetricsClient } from "./mock-keyword-metrics-client";
import { NaverSearchAdClient } from "./naver-search-ad-client";
import { RulesKeywordClient } from "./rules-keyword-client";
import {
  isNaverCommerceConfigured,
  createConfiguredNaverClient,
  createConfiguredNaverClientForUser,
} from "@/modules/channels/naver/naver-category-service";
import { NaverCategoryRepository } from "@/modules/channels/naver/naver-category-repository";
import {
  CommerceApiManagedProductImporter,
  CommerceApiManagedProductSalesReader,
  CommerceApiManagedProductUpdater,
} from "./naver-product-importer";
import type { NaverRegisteredAttribute } from "./types";
import { NaverCommerceRelayClient } from "@/modules/channels/naver/naver-commerce-relay";

export function createKeywordManagementService(
  database: Database,
  ownerId?: string,
) {
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
      ? ownerId
        ? {
            import: async (
              channelProductNo: string,
              storeConnectionId?: string,
            ) =>
              new CommerceApiManagedProductImporter(
                await createConfiguredNaverClientForUser(
                  database,
                  ownerId,
                  env,
                  storeConnectionId,
                ),
                new NaverCategoryRepository(database),
              ).import(channelProductNo),
          }
        : new CommerceApiManagedProductImporter(
            createConfiguredNaverClient(env),
            new NaverCategoryRepository(database),
          )
      : null;
  const productUpdater =
    !mock && isNaverCommerceConfigured(env) && ownerId
      ? {
          apply: async (
            channelProductNo: string,
            input: {
              title: string;
              searchTags: string[];
              salePrice: number;
              stockQuantity: number;
              statusType: "SALE" | "OUTOFSTOCK" | "SUSPENSION";
              naverAttributes: NaverRegisteredAttribute[];
              originProductNo?: string;
            },
            storeConnectionId?: string,
          ) =>
            new CommerceApiManagedProductUpdater(
              await createConfiguredNaverClientForUser(
                database,
                ownerId,
                env,
                storeConnectionId,
              ),
            ).apply(channelProductNo, input),
        }
      : null;
  const salesReader =
    !mock && isNaverCommerceConfigured(env) && ownerId
      ? {
          summarize: async (
            channelProductNo: string,
            storeConnectionId?: string,
          ) =>
            new CommerceApiManagedProductSalesReader(
              await createConfiguredNaverClientForUser(
                database,
                ownerId,
                env,
                storeConnectionId,
              ),
            ).summarize(channelProductNo),
          summarizeMany: async (
            channelProductNos: string[],
            storeConnectionId?: string,
          ) =>
            new CommerceApiManagedProductSalesReader(
              await createConfiguredNaverClientForUser(
                database,
                ownerId,
                env,
                storeConnectionId,
              ),
            ).summarizeMany(channelProductNos),
        }
      : null;
  const rankReader =
    !mock &&
    Boolean(
      (env.NAVER_COMMERCE_RELAY_URL_OVERRIDE ??
        env.NAVER_COMMERCE_RELAY_URL) &&
        env.NAVER_COMMERCE_RELAY_SHARED_SECRET,
    )
      ? {
          observe: async (
            input: Parameters<
              NaverCommerceRelayClient["observeShoppingRanks"]
            >[0],
          ) => {
            const client = createConfiguredNaverClient(env);
            if (!(client instanceof NaverCommerceRelayClient)) {
              throw new Error("naver_rank_relay_not_configured");
            }
            return client.observeShoppingRanks(input);
          },
        }
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
    productUpdater,
    salesReader,
    rankReader,
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
    rankLookupConfigured: Boolean(
      (env.NAVER_COMMERCE_RELAY_URL_OVERRIDE ??
        env.NAVER_COMMERCE_RELAY_URL) &&
        env.NAVER_COMMERCE_RELAY_SHARED_SECRET,
    ),
  };
}
