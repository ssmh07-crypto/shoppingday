import "server-only";
import type { NaverCategoriesClient } from "./naver-commerce-relay";
import { createConfiguredNaverClient } from "./naver-category-service";

const CACHE_TTL_MS = 24 * 60 * 60_000;

type Metadata = {
  attributes: Awaited<
    ReturnType<NaverCategoriesClient["fetchProductAttributes"]>
  >;
  standardOptions: Awaited<
    ReturnType<NaverCategoriesClient["fetchStandardOptions"]>
  >;
};

const cache = new Map<string, { value: Metadata; expiresAt: number }>();

export class NaverCategoryMetadataService {
  constructor(
    private readonly client: NaverCategoriesClient,
    private readonly now: () => number = Date.now,
  ) {}

  async get(categoryId: string) {
    const cached = cache.get(categoryId);
    if (cached && cached.expiresAt > this.now()) {
      return summarize(categoryId, cached.value, true, false);
    }

    try {
      const [attributes, standardOptions] = await Promise.all([
        this.client.fetchProductAttributes(categoryId),
        this.client.fetchStandardOptions(categoryId),
      ]);
      const value = { attributes, standardOptions };
      cache.set(categoryId, {
        value,
        expiresAt: this.now() + CACHE_TTL_MS,
      });
      return summarize(categoryId, value, false, false);
    } catch (error) {
      if (cached) return summarize(categoryId, cached.value, true, true);
      throw error;
    }
  }
}

export function createNaverCategoryMetadataService() {
  return new NaverCategoryMetadataService(createConfiguredNaverClient());
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
