import "server-only";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { productProcessingSettings } from "@/lib/db/schema";
import {
  defaultProductProcessingSettings,
  productProcessingSettingsInputSchema,
  type ProductProcessingSettings,
} from "./product-processing-settings";

export class ProductProcessingSettingsRepository {
  constructor(private readonly database: Database) {}

  async get(userId: string): Promise<ProductProcessingSettings> {
    const [settings] = await this.database
      .select({
        syncProtectedFields: productProcessingSettings.syncProtectedFields,
        applyCategoryQueryToTitleByDefault:
          productProcessingSettings.applyCategoryQueryToTitleByDefault,
      })
      .from(productProcessingSettings)
      .where(eq(productProcessingSettings.userId, userId))
      .limit(1);
    const parsed = productProcessingSettingsInputSchema.safeParse(settings);
    return parsed.success ? parsed.data : defaultProductProcessingSettings;
  }

  async save(userId: string, input: ProductProcessingSettings) {
    const settings = productProcessingSettingsInputSchema.parse(input);
    const [saved] = await this.database
      .insert(productProcessingSettings)
      .values({ userId, ...settings })
      .onConflictDoUpdate({
        target: productProcessingSettings.userId,
        set: { ...settings, updatedAt: new Date() },
      })
      .returning({
        syncProtectedFields: productProcessingSettings.syncProtectedFields,
        applyCategoryQueryToTitleByDefault:
          productProcessingSettings.applyCategoryQueryToTitleByDefault,
      });
    return productProcessingSettingsInputSchema.parse(saved);
  }
}
