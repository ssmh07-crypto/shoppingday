import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery, withDbSession, type Database } from "@/lib/db";
import { SourcingResearchError } from "@/modules/sourcing/sourcing-errors";
import {
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from "@/modules/products/product-errors";

type AdminUser = { id: string };

export function withAdminSourcingRoute(
  handler: (user: AdminUser, database: Database) => Promise<Response>,
) {
  return withDbSession(async (database) => {
    try {
      return await handler(await requireAdmin(database), database);
    } catch (error) {
      return sourcingRouteError(error);
    }
  });
}

export async function withAdminSourcingReadRoute(
  handler: (user: AdminUser, database: Database) => Promise<Response>,
) {
  try {
    return await withDbReadRecovery(async (database) =>
      handler(await requireAdmin(database), database),
    );
  } catch (error) {
    return sourcingRouteError(error);
  }
}

function sourcingRouteError(error: unknown) {
  if (error instanceof AuthenticationError) {
    return apiError(error.code, error.message, 401);
  }
  if (error instanceof SourcingResearchError) {
    return apiError(error.code, error.message, error.status);
  }
  if (error instanceof ProductNotFoundError) {
    return apiError(error.code, error.message, 404);
  }
  if (error instanceof ProductConflictError) {
    return apiError(error.code, error.message, 409);
  }
  if (error instanceof ProductValidationError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          errors: error.errors,
        },
      },
      { status: 422 },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "validation_error",
          message: "입력값을 확인해 주세요.",
          errors: Object.fromEntries(
            error.issues.map((issue) => [issue.path.join("."), issue.message]),
          ),
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof SyntaxError) {
    return apiError("invalid_json", "요청 본문이 올바른 JSON이 아닙니다.", 400);
  }
  return apiError("internal_error", "요청을 처리하지 못했습니다.", 500);
}

function apiError(code: string, message: string, status: number) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status },
  );
}
