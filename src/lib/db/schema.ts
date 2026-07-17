import {
  boolean,
  check,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  index,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const userRoleEnum = pgEnum("user_role", ["admin", "viewer"]);
export const supplierStatusEnum = pgEnum("supplier_status", [
  "active",
  "inactive",
]);
export const availabilityEnum = pgEnum("supplier_availability", [
  "active",
  "sold_out",
  "unknown",
]);
export const productStatusEnum = pgEnum("product_status", [
  "draft",
  "editing",
  "ready",
  "archived",
]);
export const supplierSyncJobTypeEnum = pgEnum("supplier_sync_job_type", [
  "all",
  "changes",
]);
export const supplierSyncJobStatusEnum = pgEnum("supplier_sync_job_status", [
  "queued",
  "running",
  "succeeded",
  "failed",
]);

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id").primaryKey(),
  role: userRoleEnum("role").notNull().default("viewer"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  status: supplierStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const supplierProducts = pgTable(
  "supplier_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    externalProductId: text("external_product_id").notNull(),
    originalName: text("original_name"),
    supplierPrice: numeric("supplier_price", { precision: 14, scale: 2 }),
    currency: text("currency").notNull().default("KRW"),
    availability: availabilityEnum("availability").notNull().default("unknown"),
    originalImages: jsonb("original_images")
      .$type<string[]>()
      .notNull()
      .default([]),
    originalOptions: jsonb("original_options")
      .$type<Array<{ name: string; price: number | null }>>()
      .notNull()
      .default([]),
    rawDescription: text("raw_description"),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    supplierCreatedAt: timestamp("supplier_created_at", {
      withTimezone: false,
    }),
    supplierUpdatedAt: timestamp("supplier_updated_at", {
      withTimezone: false,
    }),
    firstImportedAt: timestamp("first_imported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("supplier_products_supplier_external_uidx").on(
      table.supplierId,
      table.externalProductId,
    ),
    check(
      "supplier_products_price_non_negative",
      sql`${table.supplierPrice} is null or ${table.supplierPrice} >= 0`,
    ),
  ],
);

export interface SelectedImage {
  id: string;
  source: "supplier" | "upload";
  sourceUrl: string;
  storedUrl: string | null;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
  enabled: boolean;
}
export interface EditedOptions {
  groups: Array<{
    id: string;
    name: string;
    values: Array<{ id: string; name: string; enabled: boolean }>;
  }>;
  combinations: Array<{
    id: string;
    valueIds: string[];
    additionalPrice: number;
    stock: number;
    enabled: boolean;
    supplierOptionReference: string | null;
  }>;
}

export const productCategories = pgTable("product_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id").references(() => userProfiles.userId),
    status: productStatusEnum("status").notNull().default("draft"),
    title: text("title").notNull().default(""),
    searchTags: jsonb("search_tags").$type<string[]>().notNull().default([]),
    sellingPrice: integer("selling_price"),
    currency: text("currency").notNull().default("KRW"),
    description: text("description").notNull().default(""),
    categoryId: uuid("category_id").references(() => productCategories.id, {
      onDelete: "set null",
    }),
    naverCategoryId: text("naver_category_id").references(
      (): AnyPgColumn => naverCommerceCategories.id,
      { onDelete: "set null" },
    ),
    selectedImages: jsonb("selected_images")
      .$type<SelectedImage[]>()
      .notNull()
      .default([]),
    editedOptions: jsonb("edited_options")
      .$type<EditedOptions>()
      .notNull()
      .default({ groups: [], combinations: [] }),
    draftVersion: integer("draft_version").notNull().default(1),
    validationErrors: jsonb("validation_errors")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "products_selling_price_positive",
      sql`${table.sellingPrice} is null or ${table.sellingPrice} > 0`,
    ),
    index("products_owner_updated_idx").on(table.ownerId, table.updatedAt),
    index("products_naver_category_idx").on(table.naverCategoryId),
  ],
);

export const productSupplierLinks = pgTable(
  "product_supplier_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    supplierProductId: uuid("supplier_product_id")
      .notNull()
      .references(() => supplierProducts.id, { onDelete: "cascade" }),
    isPrimary: boolean("is_primary").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("product_supplier_links_product_supplier_uidx").on(
      table.productId,
      table.supplierProductId,
    ),
    uniqueIndex("product_supplier_links_supplier_product_uidx").on(
      table.supplierProductId,
    ),
  ],
);

export const supplierApiCallLogs = pgTable("supplier_api_call_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  supplierId: uuid("supplier_id").references(() => suppliers.id),
  requestId: uuid("request_id").notNull(),
  requestType: text("request_type").notNull(),
  sanitizedParameters: jsonb("sanitized_parameters")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  success: boolean("success").notNull(),
  responseStatus: integer("response_status"),
  responseCount: integer("response_count"),
  durationMs: integer("duration_ms").notNull(),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const supplierSyncJobs = pgTable(
  "supplier_sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => userProfiles.userId),
    type: supplierSyncJobTypeEnum("type").notNull(),
    status: supplierSyncJobStatusEnum("status").notNull().default("queued"),
    dateFrom: date("date_from"),
    dateTo: date("date_to"),
    total: integer("total").notNull().default(0),
    processed: integer("processed").notNull().default(0),
    created: integer("created").notNull().default(0),
    updated: integer("updated").notNull().default(0),
    unchanged: integer("unchanged").notNull().default(0),
    errorMessage: text("error_message"),
    githubRunId: text("github_run_id"),
    githubRunUrl: text("github_run_url"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("supplier_sync_jobs_supplier_requested_idx").on(
      table.supplierId,
      table.requestedAt,
    ),
    index("supplier_sync_jobs_status_idx").on(table.status, table.requestedAt),
    uniqueIndex("supplier_sync_jobs_one_active_uidx")
      .on(table.supplierId)
      .where(sql`${table.status} in ('queued', 'running')`),
  ],
);

export const naverCommerceCategories = pgTable(
  "naver_commerce_categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    wholeCategoryName: text("whole_category_name").notNull(),
    last: boolean("last").notNull(),
    syncBatchId: uuid("sync_batch_id").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("naver_commerce_categories_name_idx").on(table.name),
    index("naver_commerce_categories_last_idx").on(table.last),
  ],
);

export const productAuditLogs = pgTable(
  "product_audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => userProfiles.userId),
    entityType: text("entity_type").notNull().default("product"),
    entityId: uuid("entity_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    changedFields: jsonb("changed_fields")
      .$type<string[]>()
      .notNull()
      .default([]),
    oldValues: jsonb("old_values")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    newValues: jsonb("new_values")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    requestId: uuid("request_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("product_audit_entity_idx").on(table.entityId, table.createdAt),
  ],
);

export type ProductRow = typeof products.$inferSelect;

export type SupplierProductRow = typeof supplierProducts.$inferSelect;

export type NaverCommerceCategoryRow =
  typeof naverCommerceCategories.$inferSelect;
