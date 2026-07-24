import { NextResponse } from "next/server";
import { z } from "zod";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";
import { createConfiguredNaverClientForUser } from "@/modules/channels/naver/naver-category-service";
import { NaverImageUploadService } from "@/modules/channels/naver/naver-image-upload-service";
import { ProductEditRepository } from "@/modules/products/product-edit-repository";
import { withAdminProductRoute } from "../../../route-utils";

const inputSchema = z.object({ draftVersion: z.number().int().positive() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductRoute(async (user, database) => {
    try {
      const { id } = await params;
      const { draftVersion } = inputSchema.parse(await request.json());
      const data = await new NaverImageUploadService(
        new ProductEditRepository(database),
        await createConfiguredNaverClientForUser(database, user.id),
      ).upload(id, user.id, draftVersion);
      return NextResponse.json({ success: true, data });
    } catch (error) {
      if (error instanceof NaverCommerceError) {
        return NextResponse.json(
          {
            success: false,
            error: { code: error.code, message: error.message },
          },
          { status: error.code === "timeout" ? 504 : 502 },
        );
      }
      throw error;
    }
  });
}
