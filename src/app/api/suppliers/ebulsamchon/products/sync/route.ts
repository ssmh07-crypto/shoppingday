import { NextResponse } from "next/server";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbSession } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import {
  isActiveJobConflict,
  SupplierSyncJobRepository,
} from "@/modules/suppliers/core/sync-job-repository";
import { createZicgamUploadToken } from "@/modules/suppliers/zicgam/zicgam-batch-storage";
import { z } from "zod";

const inputSchema = z.object({ mode: z.enum(["all", "changes"]) }).strict();

export async function GET() {
  return withDbSession(async (database) => {
    try {
      await requireAdmin(database);
      const job = await new SupplierSyncJobRepository(database).latest(
        "ebulsamchon",
      );
      return NextResponse.json(
        { success: true, job },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      return syncError(error);
    }
  });
}

export async function POST(request: Request) {
  return withDbSession(async (database) => {
    const jobs = new SupplierSyncJobRepository(database);
    try {
      const user = await requireAdmin(database);
      const input = inputSchema.parse(await request.json().catch(() => null));
      await database
        .insert(suppliers)
        .values({
          code: "ebulsamchon",
          name: "이불삼촌",
          productNumberPrefix: "ES",
          status: "active",
        })
        .onConflictDoNothing({ target: suppliers.code });
      let job;
      try {
        job = await jobs.create("ebulsamchon", user.id, input.mode);
      } catch (error) {
        if (!isActiveJobConflict(error)) throw error;
        const existing = await jobs.latest("ebulsamchon");
        if (
          !existing ||
          existing.actorId !== user.id ||
          existing.type !== input.mode ||
          existing.status !== "queued" ||
          existing.total !== 0
        ) {
          throw error;
        }
        job = existing;
      }
      return NextResponse.json(
        {
          success: true,
          job,
          uploadToken: await createZicgamUploadToken(job.id),
        },
        { status: 201 },
      );
    } catch (error) {
      return syncError(error);
    }
  });
}

function syncError(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "invalid_sync_mode",
          message: "가져오기 모드를 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }
  if (error instanceof AuthenticationError) {
    return NextResponse.json(
      { success: false, error: { code: error.code, message: error.message } },
      { status: 401 },
    );
  }
  if (isActiveJobConflict(error)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "sync_already_running",
          message: "이미 이불삼촌 상품 가져오기가 진행 중입니다.",
        },
      },
      { status: 409 },
    );
  }
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "sync_start_failed",
        message: "이불삼촌 가져오기 작업을 만들지 못했습니다.",
      },
    },
    { status: 500 },
  );
}
