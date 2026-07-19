import "server-only";
import { eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { naverStoreSettings } from "@/lib/db/schema";
import type { NaverStoreSettingsInput } from "./naver-store-settings";

export class NaverStoreSettingsRepository {
  constructor(private readonly database: Database) {}

  async get(userId: string) {
    const [settings] = await this.database
      .select()
      .from(naverStoreSettings)
      .where(eq(naverStoreSettings.userId, userId))
      .limit(1);
    return settings ?? null;
  }

  async save(userId: string, input: NaverStoreSettingsInput) {
    const [settings] = await this.database
      .insert(naverStoreSettings)
      .values({ userId, ...input })
      .onConflictDoUpdate({
        target: naverStoreSettings.userId,
        set: { ...input, updatedAt: new Date() },
      })
      .returning();
    return settings!;
  }
}
