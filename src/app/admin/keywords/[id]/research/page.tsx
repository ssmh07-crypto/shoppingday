import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireAdminPage } from "@/lib/auth/admin";
import { withDbReadRecovery } from "@/lib/db";
import { keywordManagedProducts } from "@/lib/db/schema";
import { defaultSourcingSignals, type SourcingResearchInput } from "@/modules/sourcing/types";
import { SourcingWorkspace } from "@/app/admin/sourcing/sourcing-workspace";
import "@/app/admin/sourcing/sourcing.css";
export const dynamic = "force-dynamic";
export default async function GrowthResearchPage({ params }: { params: Promise<{ id: string }> }) {
  const parsed = z.uuid().safeParse((await params).id);
  if (!parsed.success) notFound();
  return withDbReadRecovery(async database => {
    const user = await requireAdminPage(database);
    const [product] = await database.select().from(keywordManagedProducts).where(and(eq(keywordManagedProducts.id, parsed.data), eq(keywordManagedProducts.ownerId, user.id))).limit(1);
    if (!product) notFound();
    const categoryId = product.productInput.naverCategoryId;
    const categoryName = product.productInput.category || categoryId || "";
    const draft: SourcingResearchInput = product.researchDraft ?? {
      status: "researching", sourcingKeyword: product.currentTitle || product.editableTitle,
      monthlySearchVolume: null, sixMonthRevenue: null, marketNotes: "",
      naverCategory: categoryId ? { id: categoryId, name: categoryName, wholeCategoryName: categoryName } : null,
      coupangAveragePrice: null, naverAveragePrice: null, expectedSellingPrice: null,
      signals: { ...defaultSourcingSignals }, finalSellingPoint: "", positiveReviews: "", negativeReviews: "", customerNeeds: "", productSpecs: "", primaryTarget: "", referenceNotes: "", reviewEntries: [], relatedKeywords: [], samples: [],
    };
    return <SourcingWorkspace initialItems={[]} initialDetail={{ ...draft, id: product.id, maximumPurchasePrice: null, registrationProductId: null, createdAt: product.createdAt, updatedAt: product.updatedAt }} growth={{ id: product.id, version: product.researchVersion }} />;
  });
}
