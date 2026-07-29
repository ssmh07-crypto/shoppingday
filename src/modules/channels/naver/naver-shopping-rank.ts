import { z } from "zod";

export const naverShoppingRankRequestSchema = z.object({
  keyword: z.string().trim().min(1).max(100),
  channelProductNo: z.string().regex(/^\d{1,20}$/),
  smartstoreUrl: z.url().max(2_000),
  maximumRank: z.literal(100).default(100),
});

export const naverShoppingRankResultSchema = z.object({
  device: z.enum(["pc", "mobile"]),
  status: z.enum(["found", "not_found", "blocked", "failed"]),
  rank: z.number().int().min(1).max(100).nullable(),
  checkedRange: z.number().int().min(1).max(100),
  observedAt: z.string().datetime(),
  message: z.string().max(500).nullable(),
});

export const naverShoppingRankResponseSchema = z.object({
  results: z.array(naverShoppingRankResultSchema).length(2),
});

export type NaverShoppingRankRequest = z.infer<
  typeof naverShoppingRankRequestSchema
>;
export type NaverShoppingRankResult = z.infer<
  typeof naverShoppingRankResultSchema
>;
export type NaverShoppingRankResponse = z.infer<
  typeof naverShoppingRankResponseSchema
>;

export interface NaverShoppingRankReader {
  observe(
    input: NaverShoppingRankRequest,
  ): Promise<NaverShoppingRankResponse>;
}
