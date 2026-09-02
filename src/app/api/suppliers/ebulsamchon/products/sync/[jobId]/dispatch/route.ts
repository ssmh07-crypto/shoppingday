import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { withDbSession } from "@/lib/db";
import { getServerEnv } from "@/lib/env/server";
import { SupplierSyncJobRepository } from "@/modules/suppliers/core/sync-job-repository";
import { isZicgamJobId } from "@/modules/suppliers/zicgam/zicgam-batch-storage";

const inputSchema = z.object({
  chunkCount: z.number().int().positive().max(1000),
  total: z.number().int().positive().max(100_000),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  return withDbSession(async (database) => {
    const user = await requireAdmin(database);
    const { jobId } = await context.params;
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!isZicgamJobId(jobId) || !input.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "validation_error",
            message: "이불삼촌 수집 작업 정보를 확인해 주세요.",
          },
        },
        { status: 400 },
      );
    }
    const jobs = new SupplierSyncJobRepository(database);
    const job = await jobs.findForSupplier(jobId, "ebulsamchon");
    if (!job || job.actorId !== user.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "job_not_found",
            message: "이불삼촌 가져오기 작업을 찾지 못했습니다.",
          },
        },
        { status: 404 },
      );
    }
    if (job.status !== "queued") {
      return NextResponse.json({ success: true, job }, { status: 202 });
    }
    const env = getServerEnv();
    if (!env.GITHUB_ACTIONS_TOKEN) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "github_actions_not_configured",
            message: "GitHub Actions 실행 토큰이 설정되지 않았습니다.",
          },
        },
        { status: 503 },
      );
    }
    await jobs.progress(jobId, {
      total: input.data.total,
      processed: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
    });
    const repository =
      env.GITHUB_ACTIONS_REPOSITORY ?? "ssmh07-crypto/shoppingday";
    let response: Response;
    try {
      response = await fetch(
        `https://api.github.com/repos/${repository}/actions/workflows/ebulsamchon-import.yml/dispatches`,
        {
          method: "POST",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
            "content-type": "application/json",
            "user-agent": "shoppingday-ebulsamchon-import",
            "x-github-api-version": "2022-11-28",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              job_id: jobId,
              chunk_count: String(input.data.chunkCount),
            },
          }),
        },
      );
    } catch {
      await jobs.fail(
        jobId,
        "GitHub Actions 실행 요청 중 네트워크 오류가 발생했습니다.",
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "github_dispatch_failed",
            message: "GitHub Actions 작업을 시작하지 못했습니다.",
          },
        },
        { status: 502 },
      );
    }
    if (!response.ok) {
      await jobs.fail(
        jobId,
        `GitHub Actions 실행 요청 실패: HTTP ${response.status}`,
      );
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "github_dispatch_failed",
            message: "GitHub Actions 작업을 시작하지 못했습니다.",
          },
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { success: true, job: await jobs.find(jobId) },
      { status: 202 },
    );
  });
}
