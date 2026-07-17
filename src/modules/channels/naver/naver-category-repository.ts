import "server-only";
import { count, desc, eq, ilike, inArray, max, ne, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { naverCommerceCategories } from "@/lib/db/schema";
import type { NaverCommerceCategory } from "./naver-commerce-client";

const INSERT_CHUNK_SIZE = 500;

export class NaverCategoryRepository {
  constructor(private readonly database: Database) {}

  async replaceAll(
    categories: NaverCommerceCategory[],
    batchId: string,
    syncedAt: Date,
  ) {
    if (categories.length === 0) {
      throw new Error("naver_categories_empty");
    }
    await this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('naver_categories_sync'))`,
      );
      for (
        let index = 0;
        index < categories.length;
        index += INSERT_CHUNK_SIZE
      ) {
        const chunk = categories.slice(index, index + INSERT_CHUNK_SIZE);
        await tx
          .insert(naverCommerceCategories)
          .values(
            chunk.map((category) => ({
              ...category,
              syncBatchId: batchId,
              lastSyncedAt: syncedAt,
              updatedAt: syncedAt,
            })),
          )
          .onConflictDoUpdate({
            target: naverCommerceCategories.id,
            set: {
              name: sql`excluded.name`,
              wholeCategoryName: sql`excluded.whole_category_name`,
              last: sql`excluded.last`,
              syncBatchId: batchId,
              lastSyncedAt: syncedAt,
              updatedAt: syncedAt,
            },
          });
      }
      await tx
        .delete(naverCommerceCategories)
        .where(ne(naverCommerceCategories.syncBatchId, batchId));
    });
  }

  async summary() {
    const [row] = await this.database
      .select({
        total: count(),
        leaf: count(sql`case when ${naverCommerceCategories.last} then 1 end`),
        lastSyncedAt: max(naverCommerceCategories.lastSyncedAt),
      })
      .from(naverCommerceCategories);
    return {
      total: row?.total ?? 0,
      leaf: row?.leaf ?? 0,
      lastSyncedAt: row?.lastSyncedAt ?? null,
    };
  }

  async list(options: { search?: string; leafOnly?: boolean; limit?: number }) {
    const search = options.search?.trim();
    const conditions = [];
    if (search) {
      conditions.push(
        or(
          ilike(naverCommerceCategories.name, `%${search}%`),
          ilike(naverCommerceCategories.wholeCategoryName, `%${search}%`),
        )!,
      );
    }
    if (options.leafOnly) {
      conditions.push(eq(naverCommerceCategories.last, true));
    }
    return this.database
      .select({
        id: naverCommerceCategories.id,
        name: naverCommerceCategories.name,
        wholeCategoryName: naverCommerceCategories.wholeCategoryName,
        last: naverCommerceCategories.last,
      })
      .from(naverCommerceCategories)
      .where(conditions.length ? sql.join(conditions, sql` and `) : undefined)
      .orderBy(
        desc(naverCommerceCategories.last),
        naverCommerceCategories.wholeCategoryName,
      )
      .limit(Math.min(Math.max(options.limit ?? 100, 1), 500));
  }

  async findLeafByIds(ids: string[]) {
    if (!ids.length) return [];
    const rows = await this.database
      .select({
        id: naverCommerceCategories.id,
        name: naverCommerceCategories.name,
        wholeCategoryName: naverCommerceCategories.wholeCategoryName,
        last: naverCommerceCategories.last,
      })
      .from(naverCommerceCategories)
      .where(
        sql`${naverCommerceCategories.last} = true and ${inArray(naverCommerceCategories.id, ids)}`,
      );
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }

  async recommendFromTitle(title: string) {
    const normalizedTitle = title.trim().toLocaleLowerCase();
    const tokens = [...new Set(normalizedTitle.split(/[^\p{L}\p{N}]+/u))]
      .filter((token) => token.length >= 2)
      .slice(0, 12);
    const tokenConditions = tokens.flatMap((token) => [
      ilike(naverCommerceCategories.name, `%${token}%`),
      ilike(naverCommerceCategories.wholeCategoryName, `%${token}%`),
    ]);
    const candidates = await this.database
      .select({
        id: naverCommerceCategories.id,
        name: naverCommerceCategories.name,
        wholeCategoryName: naverCommerceCategories.wholeCategoryName,
        last: naverCommerceCategories.last,
      })
      .from(naverCommerceCategories)
      .where(
        tokenConditions.length
          ? sql`${naverCommerceCategories.last} = true and (${normalizedTitle} ilike '%' || ${naverCommerceCategories.name} || '%' or ${or(...tokenConditions)})`
          : sql`${naverCommerceCategories.last} = true and ${normalizedTitle} ilike '%' || ${naverCommerceCategories.name} || '%'`,
      )
      .limit(100);
    const best = candidates
      .map((category) => ({
        category,
        score: categoryScore(normalizedTitle, tokens, category),
      }))
      .sort((a, b) => b.score - a.score)[0];
    return best && best.score >= 120 ? best.category : null;
  }
}

function categoryScore(
  title: string,
  tokens: string[],
  category: { name: string; wholeCategoryName: string },
) {
  const name = category.name.toLocaleLowerCase();
  const path = category.wholeCategoryName.toLocaleLowerCase();
  let score = title.includes(name) ? 100 + name.length * 5 : 0;
  for (const token of tokens) {
    if (name.includes(token)) score += 20 + token.length;
    else if (path.includes(token)) score += 5 + token.length;
  }
  return score;
}
