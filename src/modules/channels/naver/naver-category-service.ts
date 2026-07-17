import "server-only";
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/db";
import { getServerEnv, type ServerEnv } from "@/lib/env/server";
import {
  NaverCommerceClient,
  NaverCommerceError,
  type NaverCommerceConfig,
  type NaverCommerceProductModel,
} from "./naver-commerce-client";
import {
  NaverCommerceRelayClient,
  type NaverCategoriesClient,
} from "./naver-commerce-relay";
import { NaverCategoryRepository } from "./naver-category-repository";

export function isNaverCommerceConfigured(env: ServerEnv = getServerEnv()) {
  const relayUrl = getNaverCommerceRelayUrl(env);
  return Boolean(
    (relayUrl && env.NAVER_COMMERCE_RELAY_SHARED_SECRET) ||
    (env.NAVER_COMMERCE_CLIENT_ID && env.NAVER_COMMERCE_CLIENT_SECRET),
  );
}

function getNaverCommerceRelayUrl(env: ServerEnv) {
  return env.NAVER_COMMERCE_RELAY_URL_OVERRIDE ?? env.NAVER_COMMERCE_RELAY_URL;
}

export function createNaverCommerceConfig(env: ServerEnv): NaverCommerceConfig {
  if (!env.NAVER_COMMERCE_CLIENT_ID || !env.NAVER_COMMERCE_CLIENT_SECRET) {
    throw new NaverCommerceError(
      "not_configured",
      "네이버 커머스API 인증정보가 설정되지 않았습니다.",
    );
  }
  return {
    apiUrl: env.NAVER_COMMERCE_API_URL,
    clientId: env.NAVER_COMMERCE_CLIENT_ID,
    clientSecret: env.NAVER_COMMERCE_CLIENT_SECRET,
    tokenType: env.NAVER_COMMERCE_TOKEN_TYPE,
    accountId: env.NAVER_COMMERCE_ACCOUNT_ID,
    timeoutMs: env.NAVER_COMMERCE_TIMEOUT_MS,
  };
}

export class NaverCategoryService {
  constructor(
    private readonly repository: NaverCategoryRepository,
    private readonly client: NaverCategoriesClient,
  ) {}

  async sync() {
    const categories = await this.client.fetchCategories();
    const syncedAt = new Date();
    await this.repository.replaceAll(categories, randomUUID(), syncedAt);
    return {
      total: categories.length,
      leaf: categories.filter((category) => category.last).length,
      syncedAt,
    };
  }

  async recommend(productName: string) {
    const ruleCategoryIds = categoryRuleIds(productName);
    if (ruleCategoryIds.length) {
      const [category] = await this.repository.findLeafByIds(ruleCategoryIds);
      if (category) {
        return { category, source: "title_rule" as const };
      }
    } else {
      const localCategory =
        await this.repository.recommendFromTitle(productName);
      if (localCategory) {
        return { category: localCategory, source: "local_index" as const };
      }
    }
    try {
      const models = await this.client.fetchProductModels(productName, 30);
      const rankedCategories = rankCatalogCategories(models);
      const categoryIds = rankedCategories.map((item) => item.categoryId);
      const [category] = await this.repository.findLeafByIds(categoryIds);
      if (category) {
        const vote = rankedCategories.find(
          (item) => item.categoryId === category.id,
        );
        return {
          category,
          source: "naver_catalog" as const,
          evidence: {
            votes: vote?.count ?? 0,
            sampleSize: models.length,
          },
        };
      }
    } catch {
      // Manual category search remains available if the relay is down.
    }
    return null;
  }
}

const TITLE_CATEGORY_RULES = [
  {
    categoryId: "50004771",
    matches: (title: string) =>
      /(캡슐커피|커피캡슐)/.test(title) &&
      /(보관|거치|홀더|디스펜서|정리|수납|스탠드|랙)/.test(title),
  },
] as const;

export function categoryRuleIds(title: string) {
  const normalized = title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  return TITLE_CATEGORY_RULES.filter((rule) => rule.matches(normalized)).map(
    (rule) => rule.categoryId,
  );
}

export function rankCatalogCategories(models: NaverCommerceProductModel[]) {
  const votes = new Map<
    string,
    {
      categoryId: string;
      count: number;
      topThreeCount: number;
      firstIndex: number;
    }
  >();
  models.forEach((model, index) => {
    const current = votes.get(model.categoryId);
    if (current) {
      current.count += 1;
      if (index < 3) current.topThreeCount += 1;
      return;
    }
    votes.set(model.categoryId, {
      categoryId: model.categoryId,
      count: 1,
      topThreeCount: index < 3 ? 1 : 0,
      firstIndex: index,
    });
  });
  return [...votes.values()].sort(
    (a, b) =>
      b.count - a.count ||
      b.topThreeCount - a.topThreeCount ||
      a.firstIndex - b.firstIndex,
  );
}

export function createNaverCategoryService(
  database: Database,
  env: ServerEnv = getServerEnv(),
) {
  const relayUrl = getNaverCommerceRelayUrl(env);
  const client =
    relayUrl && env.NAVER_COMMERCE_RELAY_SHARED_SECRET
      ? new NaverCommerceRelayClient({
          relayUrl,
          sharedSecret: env.NAVER_COMMERCE_RELAY_SHARED_SECRET,
          timeoutMs: env.NAVER_COMMERCE_TIMEOUT_MS,
        })
      : new NaverCommerceClient(createNaverCommerceConfig(env));
  return new NaverCategoryService(
    new NaverCategoryRepository(database),
    client,
  );
}
