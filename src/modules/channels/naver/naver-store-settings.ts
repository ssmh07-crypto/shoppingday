import { z } from "zod";

const smartstoreUrlSchema = z
  .url("스마트스토어 주소를 확인해 주세요.")
  .refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["smartstore.naver.com", "brand.naver.com"].includes(url.hostname)
    );
  }, "smartstore.naver.com 또는 brand.naver.com 주소를 입력해 주세요.");

export const naverStoreSettingsInputSchema = z.object({
  storeName: z.string().trim().min(1, "스토어명을 입력해 주세요.").max(100),
  storeUrl: smartstoreUrlSchema,
  authType: z.enum(["SELF", "SELLER"]).optional(),
  accountId: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || null),
  isDefault: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.authType === "SELLER" && !value.accountId) {
    context.addIssue({
      code: "custom",
      path: ["accountId"],
      message: "다른 판매자 스토어는 판매자 ID 또는 UID가 필요합니다.",
    });
  }
}).transform((value) => ({
  ...value,
  authType: value.authType ?? (value.accountId ? "SELLER" : "SELF"),
}));

export type NaverStoreSettingsInput = z.infer<
  typeof naverStoreSettingsInputSchema
>;
