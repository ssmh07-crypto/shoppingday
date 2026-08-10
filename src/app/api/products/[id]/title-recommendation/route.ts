import { NextResponse } from "next/server";
import { z } from "zod";
import { createProductEditService } from "@/modules/products/product-edit-factory";
import { createProductTitleRecommendationService } from "@/modules/keywords/product-title-recommendation";
import { withAdminProductReadRoute } from "../../route-utils";

const inputSchema = z.object({
  title: z.string().trim().min(2).max(200),
  originalTitle: z.string().trim().max(300).optional(),
  categoryPath: z.string().trim().max(500).optional(),
  searchTags: z.array(z.string().trim().max(50)).max(10).default([]),
  analysisCriteria: z
    .object({
      productType: z.string().trim().min(1).max(50),
      materials: z.array(z.string().trim().min(1).max(50)).max(10),
      uses: z.array(z.string().trim().min(1).max(50)).max(10),
      modifiers: z.array(z.string().trim().min(1).max(50)).max(10),
      removedTerms: z.array(z.string().trim().min(1).max(50)).max(20),
    })
    .optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductReadRoute(async (user, database) => {
    const { id } = await params;
    await createProductEditService(database).get(id, user.id);
    const input = inputSchema.parse(await request.json());
    const recommendation =
      await createProductTitleRecommendationService().recommend(input);
    return NextResponse.json(
      { success: true, recommendation },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}
