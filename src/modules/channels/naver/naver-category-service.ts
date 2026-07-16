import "server-only";
import { randomUUID } from "node:crypto";
import type { Database } from "@/lib/db";
import { getServerEnv, type ServerEnv } from "@/lib/env/server";
import {
  NaverCommerceClient,
  NaverCommerceError,
  type NaverCommerceConfig,
} from "./naver-commerce-client";
import { NaverCategoryRepository } from "./naver-category-repository";

export function isNaverCommerceConfigured(env: ServerEnv = getServerEnv()) {
  return Boolean(
    env.NAVER_COMMERCE_CLIENT_ID && env.NAVER_COMMERCE_CLIENT_SECRET,
  );
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
    private readonly client: NaverCommerceClient,
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
}

export function createNaverCategoryService(
  database: Database,
  env: ServerEnv = getServerEnv(),
) {
  return new NaverCategoryService(
    new NaverCategoryRepository(database),
    new NaverCommerceClient(createNaverCommerceConfig(env)),
  );
}
