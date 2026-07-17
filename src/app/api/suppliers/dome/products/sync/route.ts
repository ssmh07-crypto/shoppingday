import { NextResponse } from "next/server";
import { z } from "zod";
import { AuthenticationError, requireAdmin } from "@/lib/auth/admin";
import { withDbSession } from "@/lib/db";
import { getServerEnv } from "@/lib/env/server";
import {
  isActiveJobConflict,
  SupplierSyncJobRepository,
} from "@/modules/suppliers/core/sync-job-repository";

const protectedFieldSchema = z.enum([
  "title",
  "description",
  "images",
  "options",
]);
const inputSchema = z.object({
  mode: z.enum(["all", "changes"]),
  protectedFields: z.array(protectedFieldSchema).max(4).default([
    "title",
    "description",
    "images",
    "options",
  ]),
});

export async function GET() {
  return withDbSession(async (database) => {
    try {
      await requireAdmin(database);
      const job = await new SupplierSyncJobRepository(database).latest("dome");
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
    let jobId: string | undefined;
    try {
      const user = await requireAdmin(database);
      const { mode, protectedFields } = inputSchema.parse(await request.json());
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

      const job = await jobs.create("dome", user.id, mode);
      jobId = job.id;
      const repository =
        env.GITHUB_ACTIONS_REPOSITORY ?? "ssmh07-crypto/shoppingday";
      const workflow = env.GITHUB_ACTIONS_WORKFLOW ?? "product-sync.yml";
      const response = await fetch(
        `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`,
        {
          method: "POST",
          headers: {
            accept: "application/vnd.github+json",
            authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
            "content-type": "application/json",
            "user-agent": "shoppingday-product-sync",
            "x-github-api-version": "2026-03-10",
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              mode,
              job_id: job.id,
              protected_fields: protectedFields.join(","),
            },
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`github_dispatch_failed:${response.status}`);
      }
      const dispatched = (await response.json().catch(() => null)) as {
        workflow_run_id?: number;
        html_url?: string;
      } | null;
      const runId = dispatched?.workflow_run_id?.toString();
      const runUrl = dispatched?.html_url;
      if (runId && runUrl) {
        await jobs.attachGithubRun(job.id, runId, runUrl);
      }
      return NextResponse.json(
        {
          success: true,
          job: {
            ...job,
            githubRunId: runId ?? job.githubRunId,
            githubRunUrl: runUrl ?? job.githubRunUrl,
          },
        },
        { status: 202 },
      );
    } catch (error) {
      if (jobId) {
        await jobs
          .fail(jobId, "GitHub Actions 작업을 시작하지 못했습니다.")
          .catch(() => undefined);
      }
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
  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "validation_error",
          message: "작업 종류를 확인해 주세요.",
        },
      },
      { status: 400 },
    );
  }
  if (isActiveJobConflict(error)) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "sync_already_running",
          message: "이미 상품 동기화 작업이 진행 중입니다.",
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
        message: "작업을 시작하지 못했습니다.",
      },
    },
    { status: 500 },
  );
}
