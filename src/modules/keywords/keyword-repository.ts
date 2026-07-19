import "server-only";
import { createHash } from "node:crypto";
import {
  and,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { getDb, type Database } from "@/lib/db";
import {
  generatedTitles,
  keywordCandidates,
  keywordManagedProducts,
  keywordMetricCache,
  productKeywordAnalyses,
  productPublications,
  products,
  type CachedKeywordMetrics,
  type ManagedProductInput as DbManagedProductInput,
  type ProductAnalysisData,
} from "@/lib/db/schema";
import type {
  AnalysisResult,
  KeywordMetrics,
  ManagedProductDetail,
  ManagedProductInput,
  ManagedProductSummary,
  ProductAnalysis,
} from "./types";
import { classifyKeywordSize, normalizeKeyword } from "./keyword-utils";
import { productAnalysisSchema } from "./schemas";

export interface LocalPublishedProduct {
  id: string;
  title: string;
  description: string;
  searchTags: string[];
  naverCategoryId: string | null;
  selectedImages: Array<{
    sourceUrl: string;
    storedUrl: string | null;
    enabled: boolean;
  }>;
}

export interface KeywordManagementRepository {
  list(ownerId: string): Promise<ManagedProductSummary[]>;
  find(ownerId: string, id: string): Promise<ManagedProductDetail | null>;
  findLocalPublication(ownerId: string, channelProductNo: string): Promise<LocalPublishedProduct | null>;
  create(
    ownerId: string,
    value: {
      linkedProductId: string | null;
      smartstoreUrl: string;
      channelProductNo: string;
      productInput: ManagedProductInput;
    },
  ): Promise<{ id: string }>;
  updateProductInput(ownerId: string, id: string, input: ManagedProductInput): Promise<boolean>;
  saveAnalysis(ownerId: string, productId: string, inputHash: string, result: AnalysisResult): Promise<void>;
  addKeywordCandidates(
    ownerId: string,
    productId: string,
    candidates: AnalysisResult["keywordCandidates"],
  ): Promise<void>;
  replaceKeywordCandidates(
    ownerId: string,
    productId: string,
    candidates: AnalysisResult["keywordCandidates"],
  ): Promise<void>;
  updateKeywordReviewStatus(
    ownerId: string,
    productId: string,
    candidateId: string,
    status: "accepted" | "rejected" | "review",
  ): Promise<boolean>;
  updateAnalysis(ownerId: string, productId: string, analysis: ProductAnalysis): Promise<boolean>;
  findCachedMetrics(keywords: string[], now: Date): Promise<KeywordMetrics[]>;
  cacheMetrics(metrics: KeywordMetrics[], expiresAt: Date): Promise<void>;
  applyMetrics(ownerId: string, productId: string, metrics: KeywordMetrics[]): Promise<void>;
  saveSelection(ownerId: string, productId: string, keywordIds: string[]): Promise<string[]>;
  createTitle(
    ownerId: string,
    productId: string,
    value: {
      selectedKeywords: string[];
      generatedTitle: string;
      model: string;
      source: "rules" | "mock";
    },
  ): Promise<{ id: string; editedTitle: string }>;
  updateTitle(ownerId: string, productId: string, titleId: string, editedTitle: string): Promise<boolean>;
  saveFinalTitle(ownerId: string, productId: string, finalTitle: string): Promise<boolean>;
}

export class DrizzleKeywordManagementRepository
  implements KeywordManagementRepository
{
  constructor(private readonly database: Database = getDb()) {}

  async list(ownerId: string) {
    return this.database
      .select({
        id: keywordManagedProducts.id,
        smartstoreUrl: keywordManagedProducts.smartstoreUrl,
        channelProductNo: keywordManagedProducts.channelProductNo,
        supplierTitle: keywordManagedProducts.supplierTitle,
        currentTitle: keywordManagedProducts.currentTitle,
        editableTitle: keywordManagedProducts.editableTitle,
        finalTitle: keywordManagedProducts.finalTitle,
        status: keywordManagedProducts.status,
        keywordCount: sql<number>`count(${keywordCandidates.id})::int`,
        selectedKeywordCount: sql<number>`count(${keywordCandidates.id}) filter (where ${keywordCandidates.isSelected} = true)::int`,
        updatedAt: keywordManagedProducts.updatedAt,
      })
      .from(keywordManagedProducts)
      .leftJoin(
        keywordCandidates,
        eq(keywordCandidates.managedProductId, keywordManagedProducts.id),
      )
      .where(eq(keywordManagedProducts.ownerId, ownerId))
      .groupBy(keywordManagedProducts.id)
      .orderBy(desc(keywordManagedProducts.updatedAt));
  }

  async find(ownerId: string, id: string): Promise<ManagedProductDetail | null> {
    const [product] = await this.database
      .select()
      .from(keywordManagedProducts)
      .where(
        and(
          eq(keywordManagedProducts.id, id),
          eq(keywordManagedProducts.ownerId, ownerId),
        ),
      )
      .limit(1);
    if (!product) return null;
    const [analysisRows, keywordRows, titleRows] = await Promise.all([
      this.database
        .select()
        .from(productKeywordAnalyses)
        .where(
          and(
            eq(productKeywordAnalyses.managedProductId, id),
            eq(productKeywordAnalyses.ownerId, ownerId),
          ),
        )
        .orderBy(desc(productKeywordAnalyses.createdAt))
        .limit(1),
      this.database
        .select()
        .from(keywordCandidates)
        .where(
          and(
            eq(keywordCandidates.managedProductId, id),
            eq(keywordCandidates.ownerId, ownerId),
          ),
        )
        .orderBy(keywordCandidates.recommendationOrder),
      this.database
        .select()
        .from(generatedTitles)
        .where(
          and(
            eq(generatedTitles.managedProductId, id),
            eq(generatedTitles.ownerId, ownerId),
          ),
        )
        .orderBy(desc(generatedTitles.createdAt))
        .limit(10),
    ]);
    const analysis = analysisRows[0];
    return {
      product: {
        id: product.id,
        smartstoreUrl: product.smartstoreUrl,
        channelProductNo: product.channelProductNo,
        linkedProductId: product.linkedProductId,
        supplierTitle: product.supplierTitle,
        currentTitle: product.currentTitle,
        editableTitle: product.editableTitle,
        finalTitle: product.finalTitle,
        productInput: product.productInput,
        status: product.status,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
      analysis: analysis
        ? {
            id: analysis.id,
            analysis: normalizeStoredAnalysis(analysis.analysis),
            model: analysis.model,
            source: analysis.source,
            isStale:
              analysis.inputHash !==
              createHash("sha256").update(JSON.stringify(product.productInput)).digest("hex"),
            createdAt: analysis.createdAt,
          }
        : null,
      keywords: keywordRows.map((row) => ({
        id: row.id,
        keyword: row.keyword,
        normalizedKeyword: row.normalizedKeyword,
        recommendationReason: row.recommendationReason,
        sourceConcepts: row.sourceConcepts,
        recommendationOrder: row.recommendationOrder,
        origin: row.origin as "rule_combination" | "naver_related" | "manual",
        reviewStatus: row.reviewStatus as "candidate" | "accepted" | "rejected" | "review",
        filterReasons: row.filterReasons,
        relevanceScore: row.relevanceScore,
        monthlyPcSearchVolume: row.monthlyPcSearchVolume,
        monthlyMobileSearchVolume: row.monthlyMobileSearchVolume,
        totalMonthlySearchVolume: row.totalMonthlySearchVolume,
        rawMonthlyPcSearchVolume: row.rawMonthlyPcSearchVolume,
        rawMonthlyMobileSearchVolume: row.rawMonthlyMobileSearchVolume,
        competition: row.competition,
        keywordSize: row.keywordSize,
        metricsStatus: row.metricsStatus,
        metricsSource: row.metricsSource,
        metricsFetchedAt: row.metricsFetchedAt,
        isSelected: row.isSelected,
      })),
      titles: titleRows.map((row) => ({
        id: row.id,
        selectedKeywords: row.selectedKeywords,
        generatedTitle: row.generatedTitle,
        editedTitle: row.editedTitle,
        model: row.model,
        source: row.source,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      })),
    };
  }

  async findLocalPublication(ownerId: string, channelProductNo: string) {
    const [row] = await this.database
      .select({
        id: products.id,
        title: products.title,
        description: products.description,
        searchTags: products.searchTags,
        naverCategoryId: products.naverCategoryId,
        selectedImages: products.selectedImages,
      })
      .from(productPublications)
      .innerJoin(products, eq(products.id, productPublications.productId))
      .where(
        and(
          eq(productPublications.channel, "naver"),
          eq(productPublications.channelProductNo, channelProductNo),
          or(eq(products.ownerId, ownerId), isNull(products.ownerId)),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async create(
    ownerId: string,
    value: {
      linkedProductId: string | null;
      smartstoreUrl: string;
      channelProductNo: string;
      productInput: ManagedProductInput;
    },
  ) {
    const [row] = await this.database
      .insert(keywordManagedProducts)
      .values({
        ownerId,
        linkedProductId: value.linkedProductId,
        smartstoreUrl: value.smartstoreUrl,
        channelProductNo: value.channelProductNo,
        supplierTitle: value.productInput.supplierTitle,
        currentTitle: value.productInput.currentTitle || null,
        editableTitle:
          value.productInput.currentTitle || value.productInput.supplierTitle,
        productInput: value.productInput as DbManagedProductInput,
      })
      .returning({ id: keywordManagedProducts.id });
    return row;
  }

  async updateProductInput(ownerId: string, id: string, input: ManagedProductInput) {
    const [row] = await this.database
      .update(keywordManagedProducts)
      .set({
        currentTitle: input.currentTitle || null,
        editableTitle: input.currentTitle || input.supplierTitle,
        productInput: input as DbManagedProductInput,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(keywordManagedProducts.id, id),
          eq(keywordManagedProducts.ownerId, ownerId),
        ),
      )
      .returning({ id: keywordManagedProducts.id });
    return Boolean(row);
  }

  async saveAnalysis(
    ownerId: string,
    productId: string,
    inputHash: string,
    result: AnalysisResult,
  ) {
    await this.database.transaction(async (tx) => {
      const [analysis] = await tx
        .insert(productKeywordAnalyses)
        .values({
          ownerId,
          managedProductId: productId,
          inputHash,
          analysis: result.productAnalysis as ProductAnalysisData,
          model: result.model,
          source: result.source,
        })
        .returning({ id: productKeywordAnalyses.id });
      await tx
        .delete(keywordCandidates)
        .where(
          and(
            eq(keywordCandidates.ownerId, ownerId),
            eq(keywordCandidates.managedProductId, productId),
          ),
        );
      if (result.keywordCandidates.length) {
        await tx.insert(keywordCandidates).values(
          result.keywordCandidates.map((candidate, recommendationOrder) => ({
            ownerId,
            managedProductId: productId,
            analysisId: analysis.id,
            keyword: candidate.keyword,
            normalizedKeyword: normalizeKeyword(candidate.keyword),
            recommendationReason: candidate.reason,
            sourceConcepts: candidate.sourceConcepts,
            recommendationOrder,
            origin: candidate.origin ?? "rule_combination",
            reviewStatus: candidate.reviewStatus ?? "candidate",
            filterReasons: candidate.filterReasons ?? [],
            relevanceScore: candidate.relevanceScore ?? null,
          })),
        );
      }
      await tx
        .update(keywordManagedProducts)
        .set({ updatedAt: new Date() })
        .where(
          and(
            eq(keywordManagedProducts.id, productId),
            eq(keywordManagedProducts.ownerId, ownerId),
          ),
        );
    });
  }

  async updateAnalysis(ownerId: string, productId: string, analysis: ProductAnalysis) {
    const [latest] = await this.database
      .select({ id: productKeywordAnalyses.id })
      .from(productKeywordAnalyses)
      .where(
        and(
          eq(productKeywordAnalyses.ownerId, ownerId),
          eq(productKeywordAnalyses.managedProductId, productId),
        ),
      )
      .orderBy(desc(productKeywordAnalyses.createdAt))
      .limit(1);
    if (!latest) return false;
    const [row] = await this.database
      .update(productKeywordAnalyses)
      .set({ analysis: analysis as ProductAnalysisData, updatedAt: new Date() })
      .where(
        and(
          eq(productKeywordAnalyses.id, latest.id),
          eq(productKeywordAnalyses.ownerId, ownerId),
        ),
      )
      .returning({ id: productKeywordAnalyses.id });
    return Boolean(row);
  }

  async addKeywordCandidates(
    ownerId: string,
    productId: string,
    candidates: AnalysisResult["keywordCandidates"],
  ) {
    if (!candidates.length) return;
    await this.database.transaction(async (tx) => {
      const [latestAnalysis] = await tx
        .select({ id: productKeywordAnalyses.id })
        .from(productKeywordAnalyses)
        .where(
          and(
            eq(productKeywordAnalyses.ownerId, ownerId),
            eq(productKeywordAnalyses.managedProductId, productId),
          ),
        )
        .orderBy(desc(productKeywordAnalyses.createdAt))
        .limit(1);
      const existing = await tx
        .select({ order: keywordCandidates.recommendationOrder })
        .from(keywordCandidates)
        .where(
          and(
            eq(keywordCandidates.ownerId, ownerId),
            eq(keywordCandidates.managedProductId, productId),
          ),
        )
        .orderBy(desc(keywordCandidates.recommendationOrder))
        .limit(1);
      const startOrder = (existing[0]?.order ?? -1) + 1;
      await tx
        .insert(keywordCandidates)
        .values(
          candidates.map((candidate, index) => ({
            ownerId,
            managedProductId: productId,
            analysisId: latestAnalysis?.id ?? null,
            keyword: candidate.keyword,
            normalizedKeyword: normalizeKeyword(candidate.keyword),
            recommendationReason: candidate.reason,
            sourceConcepts: candidate.sourceConcepts,
            recommendationOrder: startOrder + index,
            origin: candidate.origin ?? "naver_related",
            reviewStatus: candidate.reviewStatus ?? "candidate",
            filterReasons: candidate.filterReasons ?? [],
            relevanceScore: candidate.relevanceScore ?? null,
          })),
        )
        .onConflictDoNothing();
    });
  }

  async replaceKeywordCandidates(
    ownerId: string,
    productId: string,
    candidates: AnalysisResult["keywordCandidates"],
  ) {
    await this.database.transaction(async (tx) => {
      const [latestAnalysis] = await tx
        .select({ id: productKeywordAnalyses.id })
        .from(productKeywordAnalyses)
        .where(
          and(
            eq(productKeywordAnalyses.ownerId, ownerId),
            eq(productKeywordAnalyses.managedProductId, productId),
          ),
        )
        .orderBy(desc(productKeywordAnalyses.createdAt))
        .limit(1);
      await tx.delete(keywordCandidates).where(
        and(
          eq(keywordCandidates.ownerId, ownerId),
          eq(keywordCandidates.managedProductId, productId),
        ),
      );
      if (candidates.length) {
        await tx.insert(keywordCandidates).values(
          candidates.map((candidate, recommendationOrder) => ({
            ownerId,
            managedProductId: productId,
            analysisId: latestAnalysis?.id ?? null,
            keyword: candidate.keyword,
            normalizedKeyword: normalizeKeyword(candidate.keyword),
            recommendationReason: candidate.reason,
            sourceConcepts: candidate.sourceConcepts,
            recommendationOrder,
            origin: candidate.origin ?? "rule_combination",
            reviewStatus: candidate.reviewStatus ?? "candidate",
            filterReasons: candidate.filterReasons ?? [],
            relevanceScore: candidate.relevanceScore ?? null,
          })),
        );
      }
    });
  }

  async updateKeywordReviewStatus(
    ownerId: string,
    productId: string,
    candidateId: string,
    status: "accepted" | "rejected" | "review",
  ) {
    const [row] = await this.database
      .update(keywordCandidates)
      .set({ reviewStatus: status, updatedAt: new Date() })
      .where(
        and(
          eq(keywordCandidates.id, candidateId),
          eq(keywordCandidates.ownerId, ownerId),
          eq(keywordCandidates.managedProductId, productId),
        ),
      )
      .returning({ id: keywordCandidates.id });
    return Boolean(row);
  }

  async findCachedMetrics(keywords: string[], now: Date) {
    if (!keywords.length) return [];
    const rows = await this.database
      .select({
        metrics: keywordMetricCache.metrics,
        fetchedAt: keywordMetricCache.fetchedAt,
      })
      .from(keywordMetricCache)
      .where(
        and(
          inArray(keywordMetricCache.normalizedKeyword, keywords.map(normalizeKeyword)),
          gt(keywordMetricCache.expiresAt, now),
        ),
      );
    return rows.map((row) => ({
      ...row.metrics,
      fetchedAt: row.fetchedAt.toISOString(),
    }));
  }

  async cacheMetrics(metrics: KeywordMetrics[], expiresAt: Date) {
    if (!metrics.length) return;
    const fetchedAt = new Date();
    for (const item of metrics) {
      const value: CachedKeywordMetrics = {
        keyword: item.keyword,
        monthlyPcSearchVolume: item.monthlyPcSearchVolume,
        monthlyMobileSearchVolume: item.monthlyMobileSearchVolume,
        totalMonthlySearchVolume: item.totalMonthlySearchVolume,
        rawMonthlyPcSearchVolume: item.rawMonthlyPcSearchVolume,
        rawMonthlyMobileSearchVolume: item.rawMonthlyMobileSearchVolume,
        competition: item.competition,
        source: item.source,
        status: item.status,
      };
      await this.database
        .insert(keywordMetricCache)
        .values({
          normalizedKeyword: normalizeKeyword(item.keyword),
          metrics: value,
          fetchedAt,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: keywordMetricCache.normalizedKeyword,
          set: { metrics: value, fetchedAt, expiresAt },
        });
    }
  }

  async applyMetrics(ownerId: string, productId: string, metrics: KeywordMetrics[]) {
    await this.database.transaction(async (tx) => {
      for (const item of metrics) {
        await tx
          .update(keywordCandidates)
          .set({
            monthlyPcSearchVolume: item.monthlyPcSearchVolume,
            monthlyMobileSearchVolume: item.monthlyMobileSearchVolume,
            totalMonthlySearchVolume: item.totalMonthlySearchVolume,
            rawMonthlyPcSearchVolume:
              item.rawMonthlyPcSearchVolume == null
                ? null
                : String(item.rawMonthlyPcSearchVolume),
            rawMonthlyMobileSearchVolume:
              item.rawMonthlyMobileSearchVolume == null
                ? null
                : String(item.rawMonthlyMobileSearchVolume),
            competition: item.competition,
            keywordSize:
              item.status === "success"
                ? classifyKeywordSize(item.totalMonthlySearchVolume)
                : "unclassified",
            metricsStatus:
              item.status === "not-found"
                ? "not_found"
                : item.status === "success"
                  ? "success"
                  : "error",
            metricsSource: item.source === "mock" ? "mock" : "naver_search_ad",
            metricsFetchedAt: new Date(item.fetchedAt),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(keywordCandidates.ownerId, ownerId),
              eq(keywordCandidates.managedProductId, productId),
              eq(keywordCandidates.normalizedKeyword, normalizeKeyword(item.keyword)),
            ),
          );
      }
    });
  }

  async saveSelection(ownerId: string, productId: string, keywordIds: string[]) {
    return this.database.transaction(async (tx) => {
      await tx
        .update(keywordCandidates)
        .set({ isSelected: false, updatedAt: new Date() })
        .where(
          and(
            eq(keywordCandidates.ownerId, ownerId),
            eq(keywordCandidates.managedProductId, productId),
          ),
        );
      if (keywordIds.length) {
        await tx
          .update(keywordCandidates)
          .set({ isSelected: true, updatedAt: new Date() })
          .where(
            and(
              eq(keywordCandidates.ownerId, ownerId),
              eq(keywordCandidates.managedProductId, productId),
              inArray(keywordCandidates.id, keywordIds),
            ),
          );
      }
      const selected = await tx
        .select({ keyword: keywordCandidates.keyword })
        .from(keywordCandidates)
        .where(
          and(
            eq(keywordCandidates.ownerId, ownerId),
            eq(keywordCandidates.managedProductId, productId),
            eq(keywordCandidates.isSelected, true),
          ),
        )
        .orderBy(keywordCandidates.recommendationOrder);
      return selected.map((row) => row.keyword);
    });
  }

  async createTitle(
    ownerId: string,
    productId: string,
    value: {
      selectedKeywords: string[];
      generatedTitle: string;
      model: string;
      source: "rules" | "mock";
    },
  ) {
    const [row] = await this.database
      .insert(generatedTitles)
      .values({
        ownerId,
        managedProductId: productId,
        selectedKeywords: value.selectedKeywords,
        generatedTitle: value.generatedTitle,
        editedTitle: value.generatedTitle,
        model: value.model,
        source: value.source,
      })
      .returning({ id: generatedTitles.id, editedTitle: generatedTitles.editedTitle });
    return row;
  }

  async updateTitle(
    ownerId: string,
    productId: string,
    titleId: string,
    editedTitle: string,
  ) {
    const [row] = await this.database
      .update(generatedTitles)
      .set({ editedTitle, updatedAt: new Date() })
      .where(
        and(
          eq(generatedTitles.id, titleId),
          eq(generatedTitles.ownerId, ownerId),
          eq(generatedTitles.managedProductId, productId),
        ),
      )
      .returning({ id: generatedTitles.id });
    return Boolean(row);
  }

  async saveFinalTitle(ownerId: string, productId: string, finalTitle: string) {
    const [row] = await this.database
      .update(keywordManagedProducts)
      .set({ editableTitle: finalTitle, finalTitle, updatedAt: new Date() })
      .where(
        and(
          eq(keywordManagedProducts.id, productId),
          eq(keywordManagedProducts.ownerId, ownerId),
        ),
      )
      .returning({ id: keywordManagedProducts.id });
    return Boolean(row);
  }
}

function normalizeStoredAnalysis(value: unknown): ProductAnalysis {
  const parsed = productAnalysisSchema.parse(value);
  if (!parsed.productType || parsed.productTypes.length) return parsed;
  return {
    ...parsed,
    productTypes: [parsed.productType],
    primaryProductType: parsed.productType,
    productTypeStatus: "review_required",
  };
}
