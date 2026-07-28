import { z } from "zod";
import { keywordLimits } from "./config";
import { addSearchTagQualityIssues } from "./search-tag-quality";

const shortText = z.string().trim().max(300).default("");
const stringList = z.array(z.string().trim().min(1).max(100)).max(30).default([]);
const naverRegisteredAttributeSchema = z.object({
  attributeSeq: z.number().int().nonnegative(),
  attributeName: z.string().trim().min(1).max(100),
  attributeValueSeq: z.number().int().nonnegative().nullable(),
  value: z.string().trim().min(1).max(200),
});
const naverCommerceImportStateSchema = z.object({
  status: z.enum(["success", "failed", "not_configured"]),
  fetchedAt: z.string().datetime().nullable(),
  message: z.string().trim().max(300).nullable(),
});

export const managedProductInputSchema = z.object({
  supplierTitle: z
    .string()
    .trim()
    .min(1, "상품명을 입력해 주세요.")
    .max(keywordLimits.maximumProductTitleLength),
  currentTitle: z.string().trim().max(keywordLimits.maximumProductTitleLength).default(""),
  description: z.string().trim().max(keywordLimits.maximumDescriptionLength).default(""),
  category: shortText,
  features: stringList,
  materials: stringList,
  colors: stringList,
  sizes: stringList,
  target: shortText,
  seasons: stringList,
  supplierUrl: z.union([z.literal(""), z.url()]).default(""),
  imageUrls: z.array(z.url()).max(20).default([]),
  memo: z.string().trim().max(keywordLimits.maximumMemoLength).default(""),
  naverCategoryId: z.string().trim().regex(/^\d{1,20}$/).optional(),
  naverAttributes: z.array(naverRegisteredAttributeSchema).max(100).optional(),
  searchTags: stringList.optional(),
  commerceImport: naverCommerceImportStateSchema.optional(),
  salePrice: z.number().int().nonnegative().nullable().optional(),
  stockQuantity: z.number().int().nonnegative().nullable().optional(),
  statusType: z.string().trim().max(30).optional(),
  representativeImageUrl: z.url().optional(),
});

export const createManagedProductSchema = z.object({
  smartstoreUrl: z.url().max(2_000),
  storeConnectionId: z.uuid().optional(),
  productInput: managedProductInputSchema.extend({
    supplierTitle: z.string().trim().max(keywordLimits.maximumProductTitleLength),
  }),
});

export const keywordRankObservationSchema = z.object({
  keyword: z.string().trim().min(1).max(100),
  rank: z.number().int().min(1).max(1000).nullable(),
  checkedAt: z.coerce.date().optional(),
  note: z.string().trim().max(300).default(""),
});

export const applyManagedProductToNaverSchema = z.object({
  confirmed: z.literal(true),
  title: z.string().trim().min(1).max(keywordLimits.maximumProductTitleLength),
  searchTags: z
    .array(z.string().trim().min(1).max(40))
    .max(10)
    .transform((values) => [...new Set(values)]),
}).superRefine((input, context) => {
  addSearchTagQualityIssues(context, input.searchTags, input.title);
});

export const productAnalysisSchema = z.object({
  productType: z.string().trim().max(200).default(""),
  productTypes: stringList,
  primaryProductType: z.string().trim().max(200).nullable().default(null),
  productTypeStatus: z
    .enum(["rule_confirmed", "review_required", "user_confirmed"])
    .default("review_required"),
  targetCustomers: stringList,
  materials: stringList,
  purposes: stringList,
  forms: stringList,
  features: stringList,
  colors: stringList,
  sizes: stringList,
  styles: stringList,
  seasons: stringList,
  useCases: stringList,
  categoryTerms: stringList,
  unclassifiedTerms: stringList,
  searchConcepts: stringList,
  analysisSource: z.literal("rule-based").default("rule-based"),
  userReviewedAt: z.string().datetime().nullable().default(null),
});

export const updateManagedProductSchema = z
  .object({
    productInput: managedProductInputSchema.optional(),
    analysis: productAnalysisSchema.optional(),
    finalTitle: z.string().trim().min(1).max(keywordLimits.maximumProductTitleLength).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "수정할 값이 없습니다.");

export const keywordSelectionSchema = z.object({
  selectedKeywordIds: z.array(z.uuid()).max(keywordLimits.maximumSelectedKeywords),
});

export const keywordReviewSchema = z.object({
  status: z.enum(["accepted", "rejected", "review"]),
});

export const generateTitleSchema = keywordSelectionSchema.extend({
  maximumLength: z.number().int().min(20).max(100).optional(),
  bannedWords: z.array(z.string().trim().min(1).max(50)).max(50).default([]),
});

export const updateGeneratedTitleSchema = z.object({
  editedTitle: z.string().trim().min(1).max(keywordLimits.maximumProductTitleLength),
});

export type CreateManagedProductInput = z.infer<typeof createManagedProductSchema>;
