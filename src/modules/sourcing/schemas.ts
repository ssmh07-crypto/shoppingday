import { z } from "zod";

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

export const sourcingResearchInputSchema = z.object({
  status: z.enum([
    "researching",
    "candidate",
    "sample_ordered",
    "selected",
    "rejected",
  ]),
  sourcingKeyword: z.string().trim().min(1, "소싱 키워드를 입력해 주세요.").max(200),
  monthlySearchVolume: nullableIntegerAmount,
  sixMonthRevenue: nullableRevenue,
  marketNotes: z.string().trim().max(5_000),
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
  samples: z.array(sourcingSampleSchema).max(10),
});
