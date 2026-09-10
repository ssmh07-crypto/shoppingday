import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import { createConfiguredNaverClientForUser } from "@/modules/channels/naver/naver-category-service";
import { NaverSearchAdClient } from "@/modules/keywords/naver-search-ad-client";
import { findKeywordsUsedInTitle } from "@/modules/keywords/keyword-utils";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { ProductValidationError } from "@/modules/products/product-errors";
import {
  analyzeBulkProductKeywords,
  type BulkKeywordProduct,
  type OfficialTag,
} from "@/modules/products/bulk-keyword-analysis";
import { withAdminProductRoute } from "../route-utils";

const previewSchema = z.object({
  productIds: z.array(z.uuid()).min(1).max(100),
});

const keywordDraftSchema = z.object({
  id: z.uuid(),
  keyword: z.string().trim().min(1).max(100),
  normalizedKeyword: z.string().trim().min(1).max(100),
  monthlySearchVolume: z.number().int().nonnegative().nullable(),
  placement: z.enum(["unclassified", "product_name", "tag"]),
  source: z.literal("naver-search-ad"),
  importedAt: z.iso.datetime(),
});

const applySchema = z.object({
  applications: z.array(z.object({
    id: z.uuid(),
    draftVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    searchTags: z.array(z.string().trim().min(1).max(30)).max(10),
    keywordDrafts: z.array(keywordDraftSchema).max(50),
    applyTitle: z.boolean(),
    applyTags: z.boolean(),
  })).min(1).max(100),
});

type Timed<T> = { expiresAt: number; value: T };
const CACHE_MS = 24 * 60 * 60_000;
const relatedCache = new Map<string, Timed<Awaited<ReturnType<NaverSearchAdClient["discoverKeywordMetrics"]>>>>();
const tagCache = new Map<string, Timed<OfficialTag[]>>();

export async function POST(request: Request) {
  return withAdminProductRoute(async (user, database) => {
    const { productIds } = previewSchema.parse(await request.json());
    const ids = [...new Set(productIds)];
    const service = createProductEditService(database);
    const records = [];
    for (let index = 0; index < ids.length; index += 10) {
      records.push(...await Promise.all(ids.slice(index, index + 10).map((id) => service.get(id, user.id))));
    }
    const products: BulkKeywordProduct[] = records.map((record) => ({
      id: record.product.id,
      title: record.product.title,
      originalName: record.supplier.originalName,
      naverCategoryId: record.product.naverCategoryId,
      naverCategoryName: record.naverCategory?.wholeCategoryName ?? record.naverCategory?.name ?? null,
      sourceTitleKeywords: record.product.sourceTitleKeywords,
      searchTags: record.product.searchTags,
      draftVersion: record.product.draftVersion,
    }));

    const env = getServerEnv();
    if (!env.NAVER_SEARCH_AD_API_KEY || !env.NAVER_SEARCH_AD_SECRET_KEY || !env.NAVER_SEARCH_AD_CUSTOMER_ID) {
      throw new ProductValidationError({
        naverSearchAd: "네이버 검색광고 API 인증정보를 먼저 설정해 주세요.",
      });
    }
    const searchClient = new NaverSearchAdClient({
      baseUrl: env.NAVER_SEARCH_AD_API_URL,
      apiKey: env.NAVER_SEARCH_AD_API_KEY,
      secretKey: env.NAVER_SEARCH_AD_SECRET_KEY,
      customerId: env.NAVER_SEARCH_AD_CUSTOMER_ID,
      timeoutMs: env.NAVER_SEARCH_AD_TIMEOUT_MS,
    });
    const relatedReader = {
      discoverKeywordMetrics: async (hints: string[], limit: number) => {
        const key = hints.map(normalize).sort().join("|");
        const cached = readCache(relatedCache, key);
        if (cached) return cached.slice(0, limit);
        try {
          const value = await searchClient.discoverKeywordMetrics(hints, limit);
          writeCache(relatedCache, key, value);
          return value;
        } catch (error) {
          throw new ProductValidationError({
            naverSearchAd: error instanceof Error ? error.message : "네이버 연관 키워드를 조회하지 못했습니다.",
          });
        }
      },
    };

    let tagClient: Awaited<ReturnType<typeof createConfiguredNaverClientForUser>> | null = null;
    try {
      tagClient = await createConfiguredNaverClientForUser(database, user.id, env);
    } catch {
      tagClient = null;
    }
    let lastTagLookupAt = 0;
    const tagReader = tagClient?.fetchRecommendTags
      ? {
          fetchRecommendTags: async (keyword: string) => {
            const key = `${user.id}:${normalize(keyword)}`;
            const cached = readCache(tagCache, key);
            if (cached) return cached;
            try {
              const remainingDelay = 550 - (Date.now() - lastTagLookupAt);
              if (remainingDelay > 0) {
                await new Promise((resolve) => setTimeout(resolve, remainingDelay));
              }
              lastTagLookupAt = Date.now();
              const value = await tagClient!.fetchRecommendTags!(keyword);
              writeCache(tagCache, key, value);
              return value;
            } catch {
              return [];
            }
          },
        }
      : null;

    const previews = await analyzeBulkProductKeywords(products, relatedReader, tagReader);
    return NextResponse.json({
      success: true,
      data: {
        previews,
        productCount: products.length,
        groupCount: new Set(products.map((item) => item.naverCategoryId ?? "uncategorized")).size,
        tagLookupConfigured: tagReader !== null,
      },
    });
  });
}

export async function PATCH(request: Request) {
  return withAdminProductRoute(async (user, database) => {
    const { applications } = applySchema.parse(await request.json());
    const service = createProductEditService(database);
    const results: Array<{ id: string; success: boolean; message?: string }> = [];
    for (const application of applications) {
      try {
        const current = await service.get(application.id, user.id);
        const naverDrafts = application.keywordDrafts;
        const mergedDrafts = new Map(
          current.product.keywordDrafts
            .filter((item) => item.source !== "naver-search-ad")
            .map((item) => [item.normalizedKeyword, item]),
        );
        for (const item of naverDrafts) mergedDrafts.set(item.normalizedKeyword, item);
        const title = application.applyTitle ? application.title : current.product.title;
        await service.saveDraft(application.id, user.id, {
          ...current.product,
          draftVersion: application.draftVersion,
          title,
          sourceTitleKeywords: application.applyTitle
            ? findKeywordsUsedInTitle(title, naverDrafts.map((item) => item.keyword))
            : current.product.sourceTitleKeywords,
          keywordDrafts: [...mergedDrafts.values()],
          searchTags: application.applyTags ? application.searchTags : current.product.searchTags,
        });
        results.push({ id: application.id, success: true });
      } catch (error) {
        results.push({
          id: application.id,
          success: false,
          message: error instanceof Error ? error.message : "적용하지 못했습니다.",
        });
      }
    }
    return NextResponse.json({
      success: true,
      data: {
        results,
        succeeded: results.filter((item) => item.success).length,
        failed: results.filter((item) => !item.success).length,
      },
    });
  });
}

function normalize(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function readCache<T>(cache: Map<string, Timed<T>>, key: string) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache<T>(cache: Map<string, Timed<T>>, key: string, value: T) {
  cache.set(key, { expiresAt: Date.now() + CACHE_MS, value });
  while (cache.size > 1_000) cache.delete(cache.keys().next().value!);
}
