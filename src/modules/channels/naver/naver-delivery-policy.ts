import { z } from "zod";
import { naverDeliveryInfoSchema } from "./naver-publication-policy";

export const naverDeliveryPolicyTemplateInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "배송정책 이름을 입력해 주세요.")
    .max(100),
  deliveryInfo: naverDeliveryInfoSchema,
});

export type NaverDeliveryPolicyTemplateInput = z.infer<
  typeof naverDeliveryPolicyTemplateInputSchema
>;
