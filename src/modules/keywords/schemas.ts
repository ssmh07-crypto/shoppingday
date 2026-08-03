import { z } from "zod";
import { naverShoppingRankResultSchema } from "@/modules/channels/naver/naver-shopping-rank";
import { keywordLimits } from "./config";
import { addSearchTagQualityIssues } from "./search-tag-quality";

const shortText = z.string().trim().max(300).default("");
const stringList = z.array(z.string().trim().min(1).max(100)).max(30).default([]);
const naverRegisteredAttributeSchema = z.object({
  attributeSeq: z.number().int().nonnegative(),
  attributeName: z.string().trim().min(1).max(100),
  attributeValueSeq: z.number().int().nonnegative().nullable(),
  value: z.string().trim().min(1).max(200),
  minValue: z.string().trim().max(100).optional(),
  maxValue: z.string().trim().max(100).optional(),
  unitCode: z.string().trim().max(30).nullable().optional(),
});
const naverCommerceImportStateSchema = z.object({
  status: z.enum(["success", "failed", "not_configured"]),
  fetchedAt: z.string().datetime().nullable(),
  message: z.string().trim().max(300).nullable(),
});
const managedProductSalesSummarySchema = z.object({
  sevenDays: z.number().int().nonnegative(),
  thirtyDays: z.number().int().nonnegative(),
  fetchedAt: z.string().datetime(),
  source: z.literal("naver_orders"),
});
const zicgamProductUrlSchema = z
  .url()
  .max(2_000)
  .refine((value) => zicgamProductNo(value) !== null, {
    message: "직감 상품 상세 URL과 product_no를 확인해 주세요.",
  });

export const supplierAvailabilityCheckSchema = z.object({
  provider: z.literal("zicgam"),
  status: z.enum([
    "available",
    "partial_sold_out",
    "sold_out",
    "discontinued",
    "auth_required",
    "unknown",
    "failed",
  ]),
  productName: z.string().trim().max(300).nullable(),
  checkedAt: z.string().datetime(),
  source: z.literal("chrome_extension"),
  url: zicgamProductUrlSchema,
  evidence: z.array(z.string().trim().min(1).max(300)).max(20),
  availableOptions: z.array(z.string().trim().min(1).max(200)).max(100),
  soldOutOptions: z.array(z.string().trim().min(1).max(200)).max(100),
});

export const supplierAvailabilityUpdateSchema = z
  .object({
    supplierUrl: zicgamProductUrlSchema,
    result: supplierAvailabilityCheckSchema,
  })
  .superRefine((input, context) => {
    if (
      zicgamProductNo(input.supplierUrl) !== zicgamProductNo(input.result.url)
    ) {
      context.addIssue({
        code: "custom",
        path: ["result", "url"],
        message: "요청한 상품과 확인 결과의 product_no가 일치하지 않습니다.",
      });
    }
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
  salesSummary: managedProductSalesSummarySchema.optional(),
  supplierAvailabilityCheck: supplierAvailabilityCheckSchema.optional(),
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

export const keywordRankLookupSchema = z.object({
  keyword: z.string().trim().min(1).max(100),
});

export const browserKeywordRankObservationSchema = z.object({
  keyword: z.string().trim().min(1).max(100),
  result: naverShoppingRankResultSchema.extend({
    device: z.literal("pc"),
  }),
}).superRefine((input, context) => {
  const { result } = input;
  if (result.status === "found" && result.rank === null) {
    context.addIssue({
      code: "custom",
      path: ["result", "rank"],
      message: "발견 결과에는 실제 순위가 필요합니다.",
    });
  }
  if (result.status !== "found" && result.rank !== null) {
    context.addIssue({
      code: "custom",
      path: ["result", "rank"],
      message: "미노출·차단·실패 결과에는 순위를 저장할 수 없습니다.",
    });
  }
  if (result.rank !== null && result.checkedRange < result.rank) {
    context.addIssue({
      code: "custom",
      path: ["result", "checkedRange"],
      message: "확인 범위는 발견 순위보다 작을 수 없습니다.",
    });
  }
});

export const applyManagedProductToNaverSchema = z.object({
  confirmed: z.literal(true),
  title: z.string().trim().min(1).max(keywordLimits.maximumProductTitleLength),
  salePrice: z.number().int().min(1).max(999_999_990),
  stockQuantity: z.number().int().min(0).max(99_999_999),
  statusType: z.enum(["SALE", "OUTOFSTOCK", "SUSPENSION"]),
  naverAttributes: z.array(naverRegisteredAttributeSchema).max(100),
  searchTags: z
    .array(z.string().trim().min(1).max(40))
    .max(10)
    .transform((values) => [...new Set(values)]),
})
  .superRefine((input, context) => {
    addSearchTagQualityIssues(context, input.searchTags, input.title);
    if (input.statusType === "SALE" && input.stockQuantity < 1) {
      context.addIssue({
        code: "custom",
        path: ["stockQuantity"],
        message: "판매 중 상태는 재고를 1개 이상 입력해야 합니다.",
      });
    }
    if (input.statusType === "OUTOFSTOCK" && input.stockQuantity !== 0) {
      context.addIssue({
        code: "custom",
        path: ["stockQuantity"],
        message: "품절 상태는 재고를 0개로 입력해야 합니다.",
      });
    }
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

function zicgamProductNo(value: string) {
  try {
    const url = new URL(value);
    const productNo = url.searchParams.get("product_no");
    return url.protocol === "https:" &&
      url.hostname === "zicgam.com" &&
      url.pathname === "/product/detail.html" &&
      productNo &&
      /^\d+$/.test(productNo)
      ? productNo
      : null;
  } catch {
    return null;
  }
}
