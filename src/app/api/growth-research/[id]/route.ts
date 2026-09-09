import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { keywordManagedProducts } from "@/lib/db/schema";
import { sourcingResearchInputSchema } from "@/modules/sourcing/schemas";
import { ProductConflictError, ProductNotFoundError } from "@/modules/products/product-errors";
import { buildSourcingRegistrationDraft } from "@/modules/sourcing/registration-draft";
import { withAdminProductRoute, withAdminProductReadRoute } from "../../products/route-utils";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdminProductReadRoute(async (user, database) => {
    const id = z.uuid().parse((await params).id);
    const [product] = await database.select().from(keywordManagedProducts).where(and(eq(keywordManagedProducts.id, id), eq(keywordManagedProducts.ownerId, user.id))).limit(1);
    if (!product) throw new ProductNotFoundError();
    const research = product.researchDraft;
    return NextResponse.json({ success: true, suggestion: research ? {
      ...buildSourcingRegistrationDraft(research.sourcingKeyword, research.relatedKeywords),
      categoryId: research.naverCategory?.id ?? null,
      attributes: research.relatedKeywords.flatMap(keyword => keyword.officialAttribute ? [keyword.officialAttribute] : []),
    } : null }, { headers: { "Cache-Control": "private, no-store" } });
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdminProductRoute(async (user, database) => {
    const id = z.uuid().parse((await params).id);
    const input = z.object({ version: z.number().int().min(0), draft: sourcingResearchInputSchema }).parse(await request.json());
    const [saved] = await database.update(keywordManagedProducts).set({ researchDraft: input.draft, researchVersion: input.version + 1 })
      .where(and(eq(keywordManagedProducts.id, id), eq(keywordManagedProducts.ownerId, user.id), eq(keywordManagedProducts.researchVersion, input.version)))
      .returning({ version: keywordManagedProducts.researchVersion });
    if (!saved) throw new ProductConflictError();
    return NextResponse.json({ success: true, ...saved });
  });
}
