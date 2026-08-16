import { z } from "zod";
import { addSearchTagQualityIssues } from "@/modules/keywords/search-tag-quality";

const nullableIntegerAmount = z.number().int().min(0).max(2_000_000_000).nullable();
const nullableRevenue = z.number().int().min(0).max(9_000_000_000_000).nullable();
const signal = z.enum(["yes", "no", "unknown"]);

export const sourcingSignalsSchema = z.object({
  widePriceSpectrum: signal,
  manyCustomerPainPoints: signal,
  mainKeywordDominant: signal,
  strongBrandMarket: signal,
  expertiseRequired: signal,
  trendDriven: signal,
  domesticProductsDominant: signal,
  manySkus: signal,
  seasonal: signal,
  bulky: signal,
  certificationRequired: signal,
});

export const sourcingSampleSchema = z.object({
  id: z.uuid(),
  url: z.union([
    z.literal(""),
    z
      .url()
      .max(2_000)
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          (url.hostname === "1688.com" || url.hostname.endsWith(".1688.com"))
        );
      }, "1688의 HTTPS 상품 링크를 입력해 주세요."),
  ]),
  price: nullableIntegerAmount,
  features: z.string().trim().max(3_000),
});

export const sourcingRelatedKeywordSchema = z.object({
  id: z.uuid(),
  keyword: z.string().trim().min(1).max(200),
  normalizedKeyword: z.string().trim().min(1).max(200),
  monthlySearchVolume: nullableIntegerAmount,
  placement: z.enum([
    "unclassified",
    "product_name",
    "tag",
    "attribute",
    "category",
  ]),
  source: z.enum(["itemscout-xlsx", "manual"]),
  importedAt: z.iso.datetime(),
  officialTag: z.object({
    code: z.number().int().positive(),
    text: z.string().trim().min(1).max(200),
  }).nullable().optional(),
  officialAttribute: z.object({
    categoryId: z.string().regex(/^\d+$/).max(20),
    categoryName: z.string().trim().min(1).max(500),
    attributeSeq: z.number().int().positive(),
    attributeName: z.string().trim().min(1).max(200),
    attributeValueSeq: z.number().int().positive(),
    attributeValueName: z.string().trim().min(1).max(200),
  }).nullable().optional(),
});

export const sourcingReviewInputSchema = z.object({
  id: z.uuid(),
  content: z.string().trim().max(10_000),
  rating: z.number().int().min(1).max(5).nullable(),
  source: z.enum(["manual", "file", "bulk", "smartstore"]),
});

export const sourcingResearchInputSchema = z.object({
  status: z.enum([
    "researching",
    "candidate",
    "sample_ordered",
    "selected",
    "rejected",
  ]),
  sourcingKeyword: z.string().trim().max(200),
  monthlySearchVolume: nullableIntegerAmount,
  sixMonthRevenue: nullableRevenue,
  marketNotes: z.string().trim().max(5_000),
  naverCategory: z.object({
    id: z.string().regex(/^\d+$/).max(20),
    name: z.string().trim().min(1).max(200),
    wholeCategoryName: z.string().trim().min(1).max(500),
  }).nullable().default(null),
  coupangAveragePrice: nullableIntegerAmount,
  naverAveragePrice: nullableIntegerAmount,
  expectedSellingPrice: nullableIntegerAmount,
  signals: sourcingSignalsSchema,
  finalSellingPoint: z.string().trim().max(10_000),
  positiveReviews: z.string().trim().max(20_000),
  negativeReviews: z.string().trim().max(20_000),
  customerNeeds: z.string().trim().max(10_000),
  productSpecs: z.string().trim().max(10_000),
  primaryTarget: z.string().trim().max(5_000),
  referenceNotes: z.string().trim().max(10_000),
  reviewEntries: z.array(sourcingReviewInputSchema).max(500).default([]).transform((entries) =>
    entries.filter((entry) => entry.content),
  ),
  relatedKeywords: z.array(sourcingRelatedKeywordSchema).max(2_000),
  samples: z.array(sourcingSampleSchema).max(10),
}).superRefine((input, context) => {
  if (input.status !== "researching" && !input.sourcingKeyword) {
    context.addIssue({
      code: "custom",
      path: ["sourcingKeyword"],
      message: "소싱 키워드를 입력해 주세요.",
    });
  }
});

export const applySourcingRegistrationDraftSchema = z.object({
  productId: z.uuid(),
  title: z.string().trim().min(1, "상품명 초안을 입력해 주세요.").max(50),
  searchTags: z.array(z.string().trim().min(1).max(30)).max(10),
}).superRefine((input, context) => {
  addSearchTagQualityIssues(context, input.searchTags, input.title);
});
