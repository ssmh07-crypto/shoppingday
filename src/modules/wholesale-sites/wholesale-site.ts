import { z } from "zod";

const wholesaleSiteUrlSchema = z
  .url("도매사이트 주소를 확인해 주세요.")
  .max(2048, "링크는 2,048자까지 입력할 수 있습니다.")
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  }, "http 또는 https 주소만 입력할 수 있습니다.");

export const wholesaleSiteInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "사이트명을 입력해 주세요.")
    .max(100, "사이트명은 100자까지 입력할 수 있습니다."),
  url: wholesaleSiteUrlSchema,
  description: z
    .string()
    .trim()
    .max(2000, "설명은 2,000자까지 입력할 수 있습니다.")
    .default(""),
});

export type WholesaleSiteInput = z.infer<typeof wholesaleSiteInputSchema>;

export type WholesaleSiteItem = WholesaleSiteInput & {
  id: string;
  updatedAt: string;
};
