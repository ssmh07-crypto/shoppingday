import "server-only";
import type { Database } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import { AsyncTtlCache } from "@/modules/core/async-ttl-cache";
import { NaverCategoryRepository } from "./naver-category-repository";
import { createConfiguredNaverClient } from "./naver-category-service";

const CACHE_TTL_MS = 24 * 60 * 60_000;
const cache = new AsyncTtlCache<unknown>(CACHE_TTL_MS, 200);

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
    const result = await cache.get(key, load, this.now);
    const stats = cache.snapshot();
    if (result.stale || stats.requests % 100 === 0) {
      logger.info("naver_metadata_cache_stats", {
        cache: "provided_notice",
        requests: stats.requests,
        hits: stats.hits,
        misses: stats.misses,
        coalesced: stats.coalesced,
        staleFallbacks: stats.staleFallbacks,
        loadFailures: stats.loadFailures,
        entries: stats.entries,
      });
    }
    return { ...result, value: result.value as T };
  }
}

export function invalidateNaverProvidedNoticeCache() {
  cache.clear();
}

export function naverProvidedNoticeCacheStats() {
  return cache.snapshot();
}

export class NaverProvidedNoticeCategoryNotFoundError extends Error {}
