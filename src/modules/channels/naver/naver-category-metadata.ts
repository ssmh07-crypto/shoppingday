import "server-only";
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

const cache = new Map<string, { value: Metadata; expiresAt: number }>();
let unitsCache: { value: Metadata["units"]; expiresAt: number } | undefined;

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
      const [attributes, attributeValues, units, standardOptions] =
        await Promise.all([
          this.client.fetchProductAttributes(categoryId),
          this.client.fetchProductAttributeValues(categoryId),
          this.getUnits(),
          this.client.fetchStandardOptions(categoryId),
        ]);
      const value = { attributes, attributeValues, units, standardOptions };
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

  private async getUnits() {
    if (unitsCache && unitsCache.expiresAt > this.now())
      return unitsCache.value;
    try {
      const value = await this.client.fetchProductAttributeUnits();
      unitsCache = { value, expiresAt: this.now() + CACHE_TTL_MS };
      return value;
    } catch (error) {
      if (unitsCache) return unitsCache.value;
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
