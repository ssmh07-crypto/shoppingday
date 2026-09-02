import { createClient } from "@supabase/supabase-js";
import { gunzipSync } from "node:zlib";
import { closeDb, getDb } from "@/lib/db";
import { SupplierSyncJobRepository } from "@/modules/suppliers/core/sync-job-repository";
import {
  EbulsamchonImportService,
  ebulsamchonCapturedProductSchema,
} from "@/modules/suppliers/ebulsamchon/ebulsamchon-import";
import {
  isZicgamJobId,
  ZICGAM_IMPORT_BUCKET,
  zicgamChunkPath,
} from "@/modules/suppliers/zicgam/zicgam-batch-storage";

async function main() {
  const jobId = process.env.SYNC_JOB_ID;
  const chunkCount = Number(process.env.SYNC_CHUNK_COUNT);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!jobId || !isZicgamJobId(jobId)) {
    throw new Error("SYNC_JOB_ID가 올바르지 않습니다.");
  }
  if (!Number.isInteger(chunkCount) || chunkCount < 1 || chunkCount > 1000) {
    throw new Error("SYNC_CHUNK_COUNT가 올바르지 않습니다.");
  }
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase Storage 인증정보가 없습니다.");
  }

  const database = getDb();
  const jobs = new SupplierSyncJobRepository(database);
  const job = await jobs.findForSupplier(jobId, "ebulsamchon");
  if (!job || job.type !== "all") {
    throw new Error("유효한 이불삼촌 가져오기 작업을 찾지 못했습니다.");
  }
  const runId = process.env.GITHUB_RUN_ID;
  const repository = process.env.GITHUB_REPOSITORY;
  const runUrl =
    runId && repository
      ? `https://github.com/${repository}/actions/runs/${runId}`
      : undefined;
  const started = await jobs.start(jobId, runId, runUrl);
  if (!started)
    throw new Error("이미 시작되었거나 종료된 이불삼촌 작업입니다.");

  const storage = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(ZICGAM_IMPORT_BUCKET);
  const importer = new EbulsamchonImportService(database);
  const progress = {
    total: job.total,
    processed: 0,
    created: 0,
    updated: 0,
    unchanged: 0,
  };
  const paths: string[] = [];
  try {
    for (let index = 0; index < chunkCount; index += 1) {
      const path = zicgamChunkPath(jobId, index);
      paths.push(path);
      const downloaded = await storage.download(path);
      if (downloaded.error) {
        throw new Error(
          `청크 ${index + 1} 다운로드 실패: ${downloaded.error.message}`,
        );
      }
      const compressed = Buffer.from(await downloaded.data.arrayBuffer());
      const parsed: unknown = JSON.parse(
        gunzipSync(compressed).toString("utf8"),
      );
      const products = ebulsamchonCapturedProductSchema.array().parse(parsed);
      for (const product of products) {
        const result = await importer.importCaptured(product, job.actorId);
        progress.processed += 1;
        progress[result.action] += 1;
        if (
          progress.processed % 20 === 0 ||
          progress.processed === progress.total
        ) {
          await jobs.progress(jobId, progress);
        }
      }
    }
    if (progress.processed !== progress.total) {
      throw new Error(
        `수집 상품 ${progress.total}개 중 ${progress.processed}개만 읽었습니다.`,
      );
    }
    await jobs.succeed(jobId, progress);
    const listed = await storage.list(jobId, { limit: 1000 });
    const cleanupPaths = listed.error
      ? paths
      : listed.data.map((item) => `${jobId}/${item.name}`);
    const removed = await storage.remove(cleanupPaths);
    if (removed.error) {
      console.warn(`임시 청크 정리 실패: ${removed.error.message}`);
    }
    console.info(`이불삼촌 가져오기 완료: ${progress.processed}개`);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "이불삼촌 일괄 가져오기에 실패했습니다.";
    await jobs.fail(jobId, message);
    throw error;
  }
}

void main()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : "이불삼촌 일괄 가져오기 실패",
    );
    process.exitCode = 1;
  })
  .finally(closeDb);
