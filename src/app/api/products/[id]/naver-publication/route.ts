import { NextResponse } from "next/server";
import { z } from "zod";
import { NaverCommerceError } from "@/modules/channels/naver/naver-commerce-client";
import { createConfiguredNaverClientForUser } from "@/modules/channels/naver/naver-category-service";
import { NaverPublicationPolicyRepository } from "@/modules/channels/naver/naver-publication-policy-repository";
import {
  NaverPublicationRepository,
  PublicationAlreadyExistsError,
  PublicationInProgressError,
  PublicationStaleAttemptError,
} from "@/modules/channels/naver/naver-publication-repository";
import {
  NaverPublicationBlockedError,
  NaverPublicationService,
  NaverPublicationUnavailableError,
  NaverPublicationUpdateRequiredError,
} from "@/modules/channels/naver/naver-publication-service";
import { ProductEditRepository } from "@/modules/products/product-edit-repository";
import { ProductNotFoundError } from "@/modules/products/product-errors";
import {
  withAdminProductReadRoute,
  withAdminProductRoute,
} from "../../route-utils";

const publishInputSchema = z.object({
  confirmed: z.literal(true),
  payloadHash: z.string().regex(/^[0-9a-f]{64}$/),
});

export async function GET(
  _: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductReadRoute(async (user, database) => {
    const { id } = await params;
    const inspection = await new NaverPublicationService(
      new ProductEditRepository(database),
      new NaverPublicationPolicyRepository(database),
      new NaverPublicationRepository(database),
    ).inspect(id, user.id);
    if (!inspection) throw new ProductNotFoundError();
    return NextResponse.json(
      { success: true, inspection },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withAdminProductRoute(async (user, database) => {
    try {
      const { id } = await params;
      const input = publishInputSchema.parse(await request.json());
      const result = await new NaverPublicationService(
        new ProductEditRepository(database),
        new NaverPublicationPolicyRepository(database),
        new NaverPublicationRepository(database),
        await createConfiguredNaverClientForUser(database, user.id),
      ).publish(id, user.id, input.payloadHash);
      return NextResponse.json(
        { success: true, result },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      if (error instanceof NaverCommerceError) {
        return NextResponse.json(
          {
            success: false,
            error: { code: error.code, message: error.message },
          },
          {
            status:
              error.responseStatus && error.responseStatus < 500
                ? 422
                : error.code === "timeout"
                  ? 504
                  : 502,
          },
        );
      }
      if (error instanceof NaverPublicationUnavailableError) {
        return publicationError(error, 503);
      }
      if (
        error instanceof NaverPublicationBlockedError ||
        error instanceof NaverPublicationUpdateRequiredError ||
        error instanceof PublicationAlreadyExistsError ||
        error instanceof PublicationInProgressError ||
        error instanceof PublicationStaleAttemptError
      ) {
        return publicationError(error, 409);
      }
      throw error;
    }
  });
}

function publicationError(error: Error & { code?: string }, status: number) {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: error.code ?? "naver_publication_conflict",
        message: error.message || "네이버 상품 발행 상태를 다시 확인해 주세요.",
      },
    },
    { status },
  );
}
