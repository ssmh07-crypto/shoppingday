import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbSession } from "@/lib/db";
import { syncScheduleInputSchema } from "@/modules/suppliers/core/sync-schedule";
import { SyncScheduleRepository } from "@/modules/suppliers/core/sync-schedule-repository";

export async function GET() {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
      const schedule = await new SyncScheduleRepository(database).get(user.id);
      return NextResponse.json(
        { schedule },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    } catch (error) {
      return scheduleError(error);
    }
  });
}

export async function PUT(request: Request) {
  return withDbSession(async (database) => {
    try {
      const user = await requireAdmin(database);
      const input = syncScheduleInputSchema.parse(await request.json());
      const schedule = await new SyncScheduleRepository(database).save(
        user.id,
        input,
      );
      return NextResponse.json({ schedule });
    } catch (error) {
      return scheduleError(error);
    }
  });
}

function scheduleError(error: unknown) {
  const conflict =
    error instanceof Error &&
    error.message === "schedule_owned_by_another_admin";
  return NextResponse.json(
    {
      error: {
        message:
          error instanceof AuthenticationError
            ? error.message
            : error instanceof z.ZodError
              ? "예약 주기를 확인해 주세요."
              : conflict
                ? "다른 관리자가 설정한 공급처 예약이 있습니다."
                : "예약 설정을 불러오거나 저장하지 못했습니다.",
      },
    },
    {
      status:
        error instanceof AuthenticationError
          ? 401
          : error instanceof z.ZodError
            ? 400
            : conflict
              ? 409
              : 500,
    },
  );
}
