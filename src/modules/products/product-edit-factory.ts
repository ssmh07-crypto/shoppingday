import "server-only";
import { getDb, type Database } from "@/lib/db";
import { createNaverCategoryMetadataService } from "@/modules/channels/naver/naver-category-metadata";
import { ProductEditRepository } from "./product-edit-repository";
import { ProductEditService } from "./product-edit-service";
export function createProductEditService(database: Database = getDb()) {
  return new ProductEditService(
    new ProductEditRepository(database),
    createNaverCategoryMetadataService(),
  );
}
