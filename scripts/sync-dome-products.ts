import { closeDb, getDb } from "@/lib/db";
import { SupplierSyncJobRepository } from "@/modules/suppliers/core/sync-job-repository";
import { createDomeImportService } from "@/modules/suppliers/dome/dome-service";

async function main() {
  const mode = process.env.SYNC_MODE;
  const jobId = process.env.SYNC_JOB_ID;
  if ((mode !== "all" && mode !== "changes") || !jobId) {
    throw new Error("SYNC_MODE(all|changes)와 SYNC_JOB_ID가 필요합니다.");
  }

  const database = getDb();
  const jobs = new SupplierSyncJobRepository(database);
  const job = await jobs.find(jobId);
  if (!job || job.type !== mode)
    throw new Error("유효한 동기화 작업을 찾지 못했습니다.");

  const runId = process.env.GITHUB_RUN_ID;
  const repository = process.env.GITHUB_REPOSITORY;
  const runUrl =
    runId && repository
      ? `https://github.com/${repository}/actions/runs/${runId}`
      : undefined;
  const started = await jobs.start(jobId, runId, runUrl);
  if (!started) throw new Error("이미 시작되었거나 종료된 동기화 작업입니다.");

  const service = createDomeImportService(database);
  try {
    if (mode === "all") {
      const result = await service.importAll(job.actorId, async (progress) => {
        await jobs.progress(jobId, progress);
        console.info(
          `진행 ${progress.processed}/${progress.total} ` +
            `(신규 ${progress.created}, 갱신 ${progress.updated})`,
        );
      });
      await jobs.succeed(jobId, { ...result, processed: result.total });
      console.info(
        `전체 가져오기 완료: 총 ${result.total}개, 신규 ${result.created}개, ` +
          `변경 ${result.updated}개, 동일 ${result.unchanged}개`,
      );
      return;
    }

    const dateTo = koreaDate(new Date());
    const lastDate = await jobs.lastSuccessfulDateTo("dome");
    const firstImportedAt = lastDate
      ? null
      : await jobs.firstImportedAt("dome");
    // The supplier accepts dates, not timestamps. Overlap one day and rely on
    // idempotent comparison so changes around midnight are never missed.
    const dateFrom = addDays(
      lastDate ?? (firstImportedAt ? koreaDate(firstImportedAt) : dateTo),
      -1,
    );
    const dates = { from: dateFrom, to: dateTo };
    const result = await service.syncChanges(
      job.actorId,
      dates,
      async (progress) => {
        await jobs.progress(jobId, progress, { dateFrom, dateTo });
        console.info(
          `진행 ${progress.processed}/${progress.total} ` +
            `(신규 ${progress.created}, 변경 ${progress.updated}, 동일 ${progress.unchanged})`,
        );
      },
    );
    await jobs.succeed(
      jobId,
      { ...result, processed: result.total },
      { dateFrom, dateTo },
    );
    console.info(
      `변동처리 완료: 총 ${result.total}개, 신규 ${result.created}개, ` +
        `변경 ${result.updated}개, 동일 ${result.unchanged}개`,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "상품 동기화에 실패했습니다.";
    await jobs.fail(jobId, message);
    throw error;
  }
}

function koreaDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "상품 동기화 실패");
    process.exitCode = 1;
  })
  .finally(closeDb);
