import { spawn } from "node:child_process";
import { closeDb, getDb } from "@/lib/db";
import { SyncScheduleRepository } from "@/modules/suppliers/core/sync-schedule-repository";
import {
  isActiveJobConflict,
  SupplierSyncJobRepository,
} from "@/modules/suppliers/core/sync-job-repository";
import { ProductProcessingSettingsRepository } from "@/modules/products/product-processing-settings-repository";
import { applyNextSupplierPrice } from "@/modules/suppliers/core/price-application-service";

async function main() {
  const database = getDb();
  const schedule = await new SyncScheduleRepository(database).claimDue();
  if (!schedule) {
    console.info("실행할 공급처 예약이 없습니다.");
    return;
  }
  const jobs = new SupplierSyncJobRepository(database);
  let jobId: string | undefined;
  try {
    const settings = await new ProductProcessingSettingsRepository(
      database,
    ).get(schedule.ownerId);
    const job = await jobs.create(
      schedule.supplierCode,
      schedule.ownerId,
      "changes",
    );
    jobId = job.id;
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "scripts/sync-dome-products.ts",
        ],
        {
          stdio: "inherit",
          windowsHide: true,
          env: {
            ...process.env,
            SYNC_MODE: "changes",
            SYNC_JOB_ID: job.id,
            SYNC_PROTECTED_FIELDS: settings.syncProtectedFields.join(","),
          },
        },
      );
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`예약 동기화 실행 실패 (${code})`)),
      );
    });
    if (schedule.applyPrices) {
      for (let count = 0; count < 1000; count++) {
        const current = await new SyncScheduleRepository(database).get(schedule.ownerId);
        if (!current?.enabled || !current.applyPrices) break;
        const applied = await applyNextSupplierPrice(database, schedule.ownerId, "dome");
        console.info(`가격 반영: ${applied.status}`);
        if (["idle", "busy", "failed"].includes(applied.status)) break;
      }
    }
  } catch (error) {
    if (isActiveJobConflict(error)) {
      console.info("이미 공급처 동기화가 진행 중입니다.");
      return;
    }
    if (jobId) {
      const current = await jobs.find(jobId);
      if (current?.status === "queued" || current?.status === "running") {
        await jobs.fail(
          jobId,
          "예약 실행에 실패했습니다. 실행 로그를 확인해 주세요.",
        );
      }
    }
    throw error;
  }
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "예약 실행 실패");
    process.exitCode = 1;
  })
  .finally(closeDb);
