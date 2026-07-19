import { z } from "zod";
import type {
  DatabaseJsonValue,
  NaverPublicationPolicyData,
  NaverPublicationPolicyOverrides,
} from "@/lib/db/schema";

const jsonValueSchema: z.ZodType<DatabaseJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

const policyFields = {
  singleStockQuantity: z.number().int().min(0).max(99_999_999).nullable(),
  deliveryInfo: jsonObjectSchema.nullable(),
  afterServiceInfo: z
    .object({
      afterServiceTelephoneNumber: z.string().trim().max(30),
      afterServiceGuideContent: z.string().trim().max(500),
    })
    .nullable(),
  originAreaInfo: z
    .object({
      originAreaCode: z.enum(["00", "01", "02", "03", "04", "05"]),
      importer: z.string().trim().max(100).optional(),
      content: z.string().trim().max(100).optional(),
      plural: z.boolean(),
    })
    .nullable(),
  productInfoProvidedNotice: jsonObjectSchema
    .and(z.object({ productInfoProvidedNoticeType: z.string().min(1) }))
    .nullable(),
  taxType: z.enum(["TAX", "DUTYFREE", "SMALL"]).nullable(),
  minorPurchasable: z.boolean().nullable(),
  naverShoppingRegistration: z.boolean().nullable(),
  channelProductDisplayStatusType: z
    .enum(["ON", "SUSPENSION"])
    .nullable(),
} satisfies z.ZodRawShape;

export const naverPublicationPolicySchema = z.object(policyFields);
export const naverPublicationPolicyOverridesSchema = z
  .object(policyFields)
  .partial();

export const emptyNaverPublicationPolicy: NaverPublicationPolicyData = {
  singleStockQuantity: null,
  deliveryInfo: null,
  afterServiceInfo: null,
  originAreaInfo: null,
  productInfoProvidedNotice: null,
  taxType: null,
  minorPurchasable: null,
  naverShoppingRegistration: null,
  channelProductDisplayStatusType: null,
};

export function parseNaverPublicationPolicy(
  value: unknown,
): NaverPublicationPolicyData {
  const parsed = naverPublicationPolicyOverridesSchema.safeParse(value);
  return parsed.success
    ? { ...emptyNaverPublicationPolicy, ...parsed.data }
    : { ...emptyNaverPublicationPolicy };
}

export function parseNaverPublicationPolicyOverrides(
  value: unknown,
): NaverPublicationPolicyOverrides {
  const parsed = naverPublicationPolicyOverridesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

export function mergeNaverPublicationPolicy(
  defaults: NaverPublicationPolicyData,
  overrides: NaverPublicationPolicyOverrides,
): NaverPublicationPolicyData {
  return naverPublicationPolicySchema.parse({ ...defaults, ...overrides });
}
