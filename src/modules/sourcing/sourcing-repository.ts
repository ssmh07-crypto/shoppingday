import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { sourcingResearches } from "@/lib/db/schema";
import type { SourcingResearchInput } from "./types";

export class SourcingResearchRepository {
  constructor(private readonly database: Database) {}

  list(ownerId: string) {
    return this.database
      .select({
        id: sourcingResearches.id,
        status: sourcingResearches.status,
        sourcingKeyword: sourcingResearches.sourcingKeyword,
        monthlySearchVolume: sourcingResearches.monthlySearchVolume,
        sixMonthRevenue: sourcingResearches.sixMonthRevenue,
        maximumPurchasePrice: sourcingResearches.maximumPurchasePrice,
        createdAt: sourcingResearches.createdAt,
        updatedAt: sourcingResearches.updatedAt,
      })
      .from(sourcingResearches)
      .where(eq(sourcingResearches.ownerId, ownerId))
      .orderBy(desc(sourcingResearches.updatedAt));
  }

  async find(ownerId: string, id: string) {
    const [row] = await this.database
      .select()
      .from(sourcingResearches)
      .where(
        and(
          eq(sourcingResearches.ownerId, ownerId),
          eq(sourcingResearches.id, id),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async create(
    ownerId: string,
    input: SourcingResearchInput,
    maximumPurchasePrice: number | null,
  ) {
    const [row] = await this.database
      .insert(sourcingResearches)
      .values({ ownerId, ...input, maximumPurchasePrice })
      .returning({ id: sourcingResearches.id });
    return row!;
  }

  async update(
    ownerId: string,
    id: string,
    input: SourcingResearchInput,
    maximumPurchasePrice: number | null,
  ) {
    const [row] = await this.database
      .update(sourcingResearches)
      .set({ ...input, maximumPurchasePrice, updatedAt: new Date() })
      .where(
        and(
          eq(sourcingResearches.ownerId, ownerId),
          eq(sourcingResearches.id, id),
        ),
      )
      .returning({ id: sourcingResearches.id });
    return row ?? null;
  }
}
