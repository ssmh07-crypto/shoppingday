import "server-only";
import type { Database } from "@/lib/db";
import { SourcingResearchRepository } from "./sourcing-repository";
import { SourcingResearchService } from "./sourcing-service";

export function createSourcingResearchService(database: Database) {
  return new SourcingResearchService(new SourcingResearchRepository(database));
}
