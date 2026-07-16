import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery, withDbSession, type Database } from "@/lib/db";
import {
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from "@/modules/products/product-errors";

type AdminUser = { id: string };

export function withAdminProductRoute(
  handler: (user: AdminUser, database: Database) => Promise<Response>,
) {
  return withDbSession(async (database) => {
    try {
      return await handler(await requireAdmin(database), database);
    } catch (error) {
      return productError(error);
    }
  });
}

export async function withAdminProductReadRoute(
  handler: (user: AdminUser, database: Database) => Promise<Response>,
) {
  try {
    return await withDbReadRecovery(async (database) =>
      handler(await requireAdmin(database), database),
    );
  } catch (error) {
    return productError(error);
  }
}

export function productError(error: unknown) {
  let code = "internal_error";
  let message = "요청을 처리하지 못했습니다.";
  let status = 500;
  let errors: Record<string, string> | undefined;

  if (error instanceof AuthenticationError) {
    code = error.code;
    message = error.message;
    status = 401;
  } else if (error instanceof ProductNotFoundError) {
    code = error.code;
    message = error.message;
    status = 404;
  } else if (error instanceof ProductConflictError) {
    code = error.code;
    message = error.message;
    status = 409;
  } else if (error instanceof ProductValidationError) {
    code = error.code;
    message = error.message;
    status = 422;
    errors = error.errors;
  } else if (error instanceof ZodError) {
    code = "validation_error";
    message = "입력값을 확인해 주세요.";
    status = 400;
    errors = Object.fromEntries(
      error.issues.map((issue) => [issue.path.join("."), issue.message]),
    );
  }

  return NextResponse.json(
    { success: false, error: { code, message, errors } },
    { status },
  );
}
