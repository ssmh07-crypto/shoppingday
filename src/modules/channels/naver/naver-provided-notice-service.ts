import "server-only";
import type { Database } from "@/lib/db";
import { NaverCategoryRepository } from "./naver-category-repository";
import { createConfiguredNaverClient } from "./naver-category-service";

const CACHE_TTL_MS = 24 * 60 * 60_000;
const cache = new Map<string, { value: unknown; expiresAt: number }>();

export class NaverProvidedNoticeService {
  constructor(
    private readonly database: Database,
    private readonly client = createConfiguredNaverClient(),
    private readonly now: () => number = Date.now,
  ) {}

  async listForCategory(categoryId: string) {
    const topLevelCategoryId = await new NaverCategoryRepository(
      this.database,
    ).findTopLevelId(categoryId);
    if (!topLevelCategoryId) throw new NaverProvidedNoticeCategoryNotFoundError();
    return this.cached(`category:${topLevelCategoryId}`, () =>
      this.client.fetchProvidedNotices(topLevelCategoryId),
    );
  }

  async listAll() {
    return this.cached("all", () => this.client.fetchProvidedNotices());
  }

  async get(type: string) {
    return this.cached(`type:${type}`, () => this.client.fetchProvidedNotice(type));
  }

  private async cached<T>(key: string, load: () => Promise<T>) {
    const existing = cache.get(key) as { value: T; expiresAt: number } | undefined;
    if (existing && existing.expiresAt > this.now()) {
      return { value: existing.value, cached: true, stale: false };
    }
    try {
      const value = await load();
      cache.set(key, { value, expiresAt: this.now() + CACHE_TTL_MS });
      return { value, cached: false, stale: false };
    } catch (error) {
      if (existing) return { value: existing.value, cached: true, stale: true };
      throw error;
    }
  }
}

export class NaverProvidedNoticeCategoryNotFoundError extends Error {}
