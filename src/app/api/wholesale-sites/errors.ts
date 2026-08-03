import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError } from "@/lib/auth/admin";

export function wholesaleSiteError(error: unknown) {
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
          message:
            error.issues[0]?.message ?? "도매사이트 정보를 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "internal_error",
        message: "도매사이트 정보를 저장하지 못했습니다.",
      },
    },
    { status: 500 },
  );
}
