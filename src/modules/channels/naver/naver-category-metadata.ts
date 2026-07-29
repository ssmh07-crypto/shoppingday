import "server-only";
import { AsyncTtlCache } from "@/modules/core/async-ttl-cache";
import { logger } from "@/lib/logging/logger";
import type { NaverCategoriesClient } from "./naver-commerce-relay";
import { createConfiguredNaverClient } from "./naver-category-service";

const CACHE_TTL_MS = 24 * 60 * 60_000;

type Metadata = {
  attributes: Awaited<
    ReturnType<NaverCategoriesClient["fetchProductAttributes"]>
  >;
  attributeValues: Awaited<
    ReturnType<NaverCategoriesClient["fetchProductAttributeValues"]>
  >;
  units: Awaited<
    ReturnType<NaverCategoriesClient["fetchProductAttributeUnits"]>
  >;
  standardOptions: Awaited<
    ReturnType<NaverCategoriesClient["fetchStandardOptions"]>
  >;
};

const metadataCache = new AsyncTtlCache<Metadata>(CACHE_TTL_MS, 500);
const unitsCache = new AsyncTtlCache<Metadata["units"]>(CACHE_TTL_MS, 1);

export class NaverCategoryMetadataService {
  constructor(
    private readonly client: NaverCategoriesClient,
    private readonly now: () => number = Date.now,
  ) {}

  async get(categoryId: string) {
    const result = await metadataCache.get(
      categoryId,
      async () => {
        const [attributes, attributeValues, units, standardOptions] =
          await Promise.all([
            this.client.fetchProductAttributes(categoryId),
            this.client.fetchProductAttributeValues(categoryId),
            this.getUnits(),
            this.client.fetchStandardOptions(categoryId),
          ]);
        return { attributes, attributeValues, units, standardOptions };
      },
      this.now,
    );
    reportCache("category", result.stale);
    return summarize(
      categoryId,
      result.value,
      result.cached,
      result.stale,
    );
  }

  private async getUnits() {
    const result = await unitsCache.get(
      "all",
      () => this.client.fetchProductAttributeUnits(),
      this.now,
    );
    reportCache("units", result.stale);
    return result.value;
  }
}

export function createNaverCategoryMetadataService() {
  return new NaverCategoryMetadataService(createConfiguredNaverClient());
}

export function invalidateNaverCategoryMetadata(categoryId?: string) {
  if (categoryId) metadataCache.delete(categoryId);
  else {
    metadataCache.clear();
    unitsCache.clear();
  }
}

export function naverCategoryMetadataCacheStats() {
  return {
    category: metadataCache.snapshot(),
    units: unitsCache.snapshot(),
  };
}

function reportCache(cache: "category" | "units", stale: boolean) {
  const stats =
    cache === "category" ? metadataCache.snapshot() : unitsCache.snapshot();
  if (!stale && stats.requests % 100 !== 0) return;
  logger.info("naver_metadata_cache_stats", {
    cache,
    requests: stats.requests,
    hits: stats.hits,
    misses: stats.misses,
    coalesced: stats.coalesced,
    staleFallbacks: stats.staleFallbacks,
    loadFailures: stats.loadFailures,
    entries: stats.entries,
  });
}

function summarize(
  categoryId: string,
  metadata: Metadata,
  cached: boolean,
  stale: boolean,
) {
  return {
    categoryId,
    attributes: metadata.attributes,
    attributeValues: metadata.attributeValues,
    units: metadata.units,
    requiredAttributes: metadata.attributes.filter(
      (attribute) => attribute.attributeType === "PRIMARY",
    ),
    standardOptions: metadata.standardOptions,
    requiredOptionGroups:
      metadata.standardOptions.standardOptionCategoryGroups.filter(
        (group) => group.optionSetRequired,
      ),
    cached,
    stale,
  };
}
