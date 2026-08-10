import { NextResponse } from "next/server";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbSession } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import {
  isActiveJobConflict,
  SupplierSyncJobRepository,
} from "@/modules/suppliers/core/sync-job-repository";
import { createZicgamUploadToken } from "@/modules/suppliers/zicgam/zicgam-batch-storage";

export async function GET() {
  return withDbSession(async (database) => {
    try {
      await requireAdmin(database);
      const job = await new SupplierSyncJobRepository(database).latest("zicgam");
      return NextResponse.json(
        { success: true, job },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      return syncError(error);
    }
  });
}

export async function POST() {
  return withDbSession(async (database) => {
    const jobs = new SupplierSyncJobRepository(database);
    try {
      const user = await requireAdmin(database);
      await database
        .insert(suppliers)
        .values({
          code: "zicgam",
          name: "직감",
          productNumberPrefix: "ZG",
          status: "active",
        })
        .onConflictDoNothing({ target: suppliers.code });
      let job;
      try {
        job = await jobs.create("zicgam", user.id, "all");
      } catch (error) {
        if (!isActiveJobConflict(error)) throw error;
        const existing = await jobs.latest("zicgam");
        if (
          !existing ||
          existing.actorId !== user.id ||
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
          message: "이미 직감 상품 가져오기가 진행 중입니다.",
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
        message: "직감 가져오기 작업을 만들지 못했습니다.",
      },
    },
    { status: 500 },
  );
}
