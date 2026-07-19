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
  accountId: z
    .string()
    .trim()
    .max(100)
    .transform((value) => value || null),
});

export type NaverStoreSettingsInput = z.infer<
  typeof naverStoreSettingsInputSchema
>;
