import "server-only";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { wholesaleSiteLinks } from "@/lib/db/schema";
import type { WholesaleSiteInput } from "./wholesale-site";

export class WholesaleSiteRepository {
  constructor(private readonly database: Database) {}

  list(ownerId: string) {
    return this.database
      .select()
      .from(wholesaleSiteLinks)
      .where(eq(wholesaleSiteLinks.ownerId, ownerId))
      .orderBy(desc(wholesaleSiteLinks.updatedAt));
  }

  async create(ownerId: string, input: WholesaleSiteInput) {
    const [created] = await this.database
      .insert(wholesaleSiteLinks)
      .values({ ownerId, ...input })
      .returning();
    return created!;
  }

  async update(ownerId: string, id: string, input: WholesaleSiteInput) {
    const [updated] = await this.database
      .update(wholesaleSiteLinks)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(wholesaleSiteLinks.id, id),
          eq(wholesaleSiteLinks.ownerId, ownerId),
        ),
      )
      .returning();
    return updated ?? null;
  }

  async remove(ownerId: string, id: string) {
    const [removed] = await this.database
      .delete(wholesaleSiteLinks)
      .where(
        and(
          eq(wholesaleSiteLinks.id, id),
          eq(wholesaleSiteLinks.ownerId, ownerId),
        ),
      )
      .returning({ id: wholesaleSiteLinks.id });
    return removed ?? null;
  }
}
