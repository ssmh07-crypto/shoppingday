import "server-only";
import { getDb, type Database } from "@/lib/db";
import { getServerEnv } from "@/lib/env/server";
import { DrizzleApiCallLogRepository } from "@/modules/audit/api-call-log-repository";
import { DrizzleProductRepository } from "@/modules/products/product-repository";
import { ProductImportService } from "@/modules/products/product-service";
import { DomeAdapter } from "./dome-adapter";
import { LiveDomeClient } from "./dome-client";
import { MockDomeClient } from "./mock-dome-client";

export function createDomeImportService(database: Database = getDb()) {
  const env = getServerEnv();
  const client = env.DOME_API_MOCK_MODE
    ? new MockDomeClient()
    : new LiveDomeClient(env);
  return new ProductImportService(
    new DrizzleProductRepository(database),
    new DrizzleApiCallLogRepository(database),
    new DomeAdapter(client),
  );
}
