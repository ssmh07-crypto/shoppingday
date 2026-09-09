import { eq } from "drizzle-orm";
import { z } from "zod";
import { closeDb, getDb } from "@/lib/db";
import { naverBulkJobs, userProfiles } from "@/lib/db/schema";
import { NaverBulkJobService } from "@/modules/channels/naver/naver-bulk-job-service";

async function main() {
  const id = z.uuid().parse(process.env.BULK_JOB_ID);
  const database = getDb();
  const [job] = await database.select().from(naverBulkJobs).where(eq(naverBulkJobs.id, id)).limit(1);
  if (!job) throw new Error("대량 작업을 찾을 수 없습니다.");
  const service = new NaverBulkJobService(database);
  const deadline = Date.now() + 40 * 60_000;
  while (Date.now() < deadline) {
    const [profile] = await database.select({ role: userProfiles.role }).from(userProfiles).where(eq(userProfiles.userId, job.ownerId)).limit(1);
    if (profile?.role !== "admin") throw new Error("작업 소유자의 관리자 권한이 없습니다.");
    const [current] = await database.select().from(naverBulkJobs).where(eq(naverBulkJobs.id, id)).limit(1);
    if (!current || ["completed", "partial_failed"].includes(current.status)) return;
    const result = await service.runNext(id, job.ownerId);
    console.info(`진행 ${result.job?.processed}/${result.job?.total}, 실패 ${result.job?.failed}`);
    await new Promise(resolve => setTimeout(resolve, result.waiting ? 2_000 : 550));
  }
  throw new Error("실행 시간 한도에 도달했습니다. 저장된 작업을 다시 계속할 수 있습니다.");
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "대량 실행 실패"); process.exitCode = 1; }).finally(closeDb);
