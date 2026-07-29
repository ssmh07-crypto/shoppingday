import "server-only";
import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { naverImageUploadCache } from "@/lib/db/schema";

const CACHE_TTL_MS = 30 * 24 * 60 * 60_000;

export interface NaverImageUploadCache {
  find(storeConnectionId: string, sourceUrl: string): Promise<string | null>;
  save(
    storeConnectionId: string,
    sourceUrl: string,
    storedUrl: string,
  ): Promise<void>;
}

export class NaverImageUploadCacheRepository
  implements NaverImageUploadCache
{
  constructor(
    private readonly database: Database,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async find(storeConnectionId: string, sourceUrl: string) {
    const [row] = await this.database
      .select({
        sourceUrl: naverImageUploadCache.sourceUrl,
        storedUrl: naverImageUploadCache.storedUrl,
      })
      .from(naverImageUploadCache)
      .where(
        and(
          eq(naverImageUploadCache.storeConnectionId, storeConnectionId),
          eq(naverImageUploadCache.sourceUrlHash, hashSourceUrl(sourceUrl)),
          gt(
            naverImageUploadCache.updatedAt,
            new Date(this.now().getTime() - CACHE_TTL_MS),
          ),
        ),
      )
      .limit(1);
    return row?.sourceUrl === sourceUrl ? row.storedUrl : null;
  }

  async save(
    storeConnectionId: string,
    sourceUrl: string,
    storedUrl: string,
  ) {
    await this.database
      .insert(naverImageUploadCache)
      .values({
        storeConnectionId,
        sourceUrlHash: hashSourceUrl(sourceUrl),
        sourceUrl,
        storedUrl,
      })
      .onConflictDoUpdate({
        target: [
          naverImageUploadCache.storeConnectionId,
          naverImageUploadCache.sourceUrlHash,
        ],
        set: { sourceUrl, storedUrl, updatedAt: this.now() },
      });
  }
}

function hashSourceUrl(sourceUrl: string) {
  return createHash("sha256").update(sourceUrl).digest("hex");
}
