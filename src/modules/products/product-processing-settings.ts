import { z } from "zod";

export const productSyncProtectedFieldSchema = z.enum([
  "title",
  "description",
  "images",
  "options",
]);
export const productSyncProtectedFields = productSyncProtectedFieldSchema.options;
export type ProductSyncProtectedField = z.infer<
  typeof productSyncProtectedFieldSchema
>;

export const productProcessingSettingsInputSchema = z.object({
  syncProtectedFields: z
    .array(productSyncProtectedFieldSchema)
    .max(productSyncProtectedFields.length),
  applyCategoryQueryToTitleByDefault: z.boolean(),
});
export type ProductProcessingSettings = z.infer<
  typeof productProcessingSettingsInputSchema
>;

export const defaultProductProcessingSettings: ProductProcessingSettings = {
  syncProtectedFields: [...productSyncProtectedFields],
  applyCategoryQueryToTitleByDefault: false,
};
