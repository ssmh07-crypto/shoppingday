import { NextResponse } from "next/server";
import { z } from "zod";
import { getServerEnv } from "@/lib/env/server";
import { NaverBulkJobRepository } from "@/modules/channels/naver/naver-bulk-job-repository";
import { ProductNotFoundError } from "@/modules/products/product-errors";
import { withAdminProductRoute } from "../../../route-utils";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAdminProductRoute(async (user, database) => {
    const { id } = z.object({ id: z.uuid() }).parse(await params);
    const job = await new NaverBulkJobRepository(database).get(id, user.id);
    if (!job) throw new ProductNotFoundError();
    if (!["queued", "running"].includes(job.status)) return NextResponse.json({ success: true, job });
    const env = getServerEnv();
    if (!env.GITHUB_ACTIONS_TOKEN) return NextResponse.json({ error: { message: "서버 실행 연결이 없습니다. 화면에서 작업 계속을 사용하세요." } }, { status: 503 });
    try {
      const response = await fetch(`https://api.github.com/repos/${env.GITHUB_ACTIONS_REPOSITORY ?? "ssmh07-crypto/shoppingday"}/actions/workflows/naver-bulk.yml/dispatches`, {
        method: "POST",
        headers: { accept: "application/vnd.github+json", authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`, "content-type": "application/json", "user-agent": "shoppingday-bulk" },
        body: JSON.stringify({ ref: "main", inputs: { job_id: id } }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("dispatch_failed");
      return NextResponse.json({ success: true, job }, { status: 202 });
    } catch {
      return NextResponse.json({ error: { message: "서버 실행 접수를 확인하지 못했습니다. 기존 작업은 보존됩니다. 진행 상태를 확인하거나 작업 계속을 사용하세요." } }, { status: 503 });
    }
  });
}
