import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbSession } from "@/lib/db";
import {
  SupplierNumberingRepository,
  supplierProductNumberPrefixInputSchema,
} from "@/modules/suppliers/core/supplier-numbering";

export async function PATCH(request: Request) {
  return withDbSession(async (database) => {
    try {
      await requireAdmin(database);
      const input = supplierProductNumberPrefixInputSchema.parse(
        await request.json(),
      );
      const supplier = await new SupplierNumberingRepository(database).save(
        input.supplierCode,
        input.prefix,
      );
      if (!supplier) {
        return NextResponse.json(
          {
            success: false,
            error: { code: "not_found", message: "공급처를 찾지 못했습니다." },
          },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: true, supplier });
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return NextResponse.json(
          { success: false, error: { code: error.code, message: error.message } },
          { status: 401 },
        );
      }
      if (error instanceof z.ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "validation_error",
              message: error.issues[0]?.message ?? "접두사를 확인해 주세요.",
            },
          },
          { status: 400 },
        );
      }
      if (isUniqueViolation(error)) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "duplicate_prefix",
              message: "다른 공급처에서 사용 중인 접두사입니다.",
            },
          },
          { status: 409 },
        );
      }
      return NextResponse.json(
        {
          success: false,
          error: { code: "internal_error", message: "접두사를 저장하지 못했습니다." },
        },
        { status: 500 },
      );
    }
  });
}

function isUniqueViolation(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505",
  );
}

