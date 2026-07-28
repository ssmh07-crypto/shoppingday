import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbReadRecovery, withDbSession, type Database } from "@/lib/db";
import { logger } from "@/lib/logging/logger";
import {
  ProductConflictError,
  ProductNotFoundError,
  ProductValidationError,
} from "@/modules/products/product-errors";

type AdminUser = { id: string };

export async function withAdminProductRoute(
  handler: (user: AdminUser, database: Database) => Promise<Response>,
) {
  const started = performance.now();
  const response = await withDbSession(async (database) => {
    try {
      return await handler(await requireAdmin(database), database);
    } catch (error) {
      return productError(error);
    }
  });
  return withRouteTiming(response, started, "product_write");
}

export async function withAdminProductReadRoute(
  handler: (user: AdminUser, database: Database) => Promise<Response>,
) {
  const started = performance.now();
  try {
    const response = await withDbReadRecovery(async (database) =>
      handler(await requireAdmin(database), database),
    );
    return withRouteTiming(response, started, "product_read");
  } catch (error) {
    return withRouteTiming(
      productError(error),
      started,
      "product_read",
    );
  }
}

function withRouteTiming(
  response: Response,
  started: number,
  operation: "product_read" | "product_write",
) {
  const durationMs = Math.round(performance.now() - started);
  response.headers.set("server-timing", `app;dur=${durationMs}`);
  if (durationMs >= 500 || response.status >= 500) {
    logger.info("admin_product_route_timing", {
      operation,
      durationMs,
      responseStatus: response.status,
    });
  }
  return response;
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
