import {
  boolean,
  bigint,
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
export const productPublicationStatusEnum = pgEnum(
  "product_publication_status",
  ["publishing", "published", "failed", "deleting", "deleted"],
);
export const keywordSizeEnum = pgEnum("keyword_size", [
  "small",
  "medium",
  "large",
  "unclassified",
]);
export const keywordCompetitionEnum = pgEnum("keyword_competition", [
  "low",
  "medium",
  "high",
  "unknown",
]);
export const keywordMetricsStatusEnum = pgEnum("keyword_metrics_status", [
  "pending",
  "success",
  "not_found",
  "error",
]);
export const externalDataSourceEnum = pgEnum("external_data_source", [
  "rules",
  // 과거 레코드 호환용. 애플리케이션 실행 경로에서는 생성하지 않는다.
  "openai",
  "naver_search_ad",
  "naver_api_hub",
  "mock",
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

export const productProcessingSettings = pgTable(
  "product_processing_settings",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => userProfiles.userId, { onDelete: "cascade" }),
    syncProtectedFields: jsonb("sync_protected_fields")
      .$type<Array<"title" | "description" | "images" | "options">>()
      .notNull()
      .default(["title", "description", "images", "options"]),
    applyCategoryQueryToTitleByDefault: boolean(
      "apply_category_query_to_title_by_default",
    )
      .notNull()
      .default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

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

export interface NaverProductAttribute {
  attributeSeq: number;
  attributeValueSeq: number | null;
  minValue: string;
  maxValue: string;
  unitCode: string | null;
}

export type PublicationChannel = "naver";
export type DatabaseJsonValue =
  | string
  | number
  | boolean
  | null
  | DatabaseJsonObject
  | DatabaseJsonValue[];
export type DatabaseJsonObject = { [key: string]: DatabaseJsonValue };

export interface NaverPublicationPolicyData {
  singleStockQuantity: number | null;
  deliveryInfo: DatabaseJsonObject | null;
  afterServiceInfo: {
    afterServiceTelephoneNumber: string;
    afterServiceGuideContent: string;
  } | null;
  originAreaInfo: {
    originAreaCode: "00" | "01" | "02" | "03" | "04" | "05";
    importer?: string;
    content?: string;
    plural: boolean;
  } | null;
  productInfoProvidedNotice: (DatabaseJsonObject & {
    productInfoProvidedNoticeType: string;
  }) | null;
  taxType: "TAX" | "DUTYFREE" | "SMALL" | null;
  minorPurchasable: boolean | null;
  naverShoppingRegistration: boolean | null;
  channelProductDisplayStatusType: "ON" | "SUSPENSION" | null;
}

export type NaverPublicationPolicyOverrides = Partial<NaverPublicationPolicyData>;

  export interface ManagedProductInput {
  supplierTitle: string;
  currentTitle?: string;
  description: string;
  category: string;
  features: string[];
  materials: string[];
  colors: string[];
  sizes: string[];
  target: string;
  seasons: string[];
  supplierUrl: string;
  imageUrls: string[];
    memo: string;
    naverCategoryId?: string;
    naverAttributes?: Array<{
      attributeSeq: number;
      attributeName: string;
      attributeValueSeq: number | null;
      value: string;
    }>;
    searchTags?: string[];
    commerceImport?: {
      status: "success" | "failed" | "not_configured";
      fetchedAt: string | null;
      message: string | null;
    };
  }

export interface ProductAnalysisData {
  productType: string;
  productTypes: string[];
  primaryProductType: string | null;
  productTypeStatus: "rule_confirmed" | "review_required" | "user_confirmed";
  targetCustomers: string[];
  materials: string[];
  purposes: string[];
  forms: string[];
  features: string[];
  colors: string[];
  sizes: string[];
  styles: string[];
  seasons: string[];
  useCases: string[];
  categoryTerms: string[];
  unclassifiedTerms: string[];
  searchConcepts: string[];
  analysisSource: "rule-based";
  userReviewedAt: string | null;
}

export interface CachedKeywordMetrics {
  keyword: string;
  monthlyPcSearchVolume: number | null;
  monthlyMobileSearchVolume: number | null;
  totalMonthlySearchVolume: number | null;
  rawMonthlyPcSearchVolume: string | number | null;
  rawMonthlyMobileSearchVolume: string | number | null;
  competition: "low" | "medium" | "high" | "unknown";
  source: "naver-search-ad" | "mock";
  status: "success" | "not-found" | "error";
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
    naverAttributes: jsonb("naver_attributes")
      .$type<NaverProductAttribute[]>()
      .notNull()
      .default([]),
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

export const channelPublicationPolicies = pgTable(
  "channel_publication_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => userProfiles.userId, { onDelete: "cascade" }),
    channel: text("channel").$type<PublicationChannel>().notNull(),
    policy: jsonb("policy")
      .$type<NaverPublicationPolicyData>()
      .notNull()
      .default({
        singleStockQuantity: null,
        deliveryInfo: null,
        afterServiceInfo: null,
        originAreaInfo: null,
        productInfoProvidedNotice: null,
        taxType: null,
        minorPurchasable: null,
        naverShoppingRegistration: null,
        channelProductDisplayStatusType: null,
      }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("channel_publication_policies_user_channel_uidx").on(
      table.userId,
      table.channel,
    ),
    check(
      "channel_publication_policies_channel_check",
      sql`${table.channel} in ('naver')`,
    ),
  ],
);

export const productPublicationPolicyOverrides = pgTable(
  "product_publication_policy_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    channel: text("channel").$type<PublicationChannel>().notNull(),
    policy: jsonb("policy")
      .$type<NaverPublicationPolicyOverrides>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("product_publication_policy_overrides_product_channel_uidx").on(
      table.productId,
      table.channel,
    ),
    check(
      "product_publication_policy_overrides_channel_check",
      sql`${table.channel} in ('naver')`,
    ),
  ],
);

export const productPublications = pgTable(
  "product_publications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    channel: text("channel").$type<PublicationChannel>().notNull(),
    status: productPublicationStatusEnum("status").notNull(),
    originProductNo: text("origin_product_no"),
    channelProductNo: text("channel_product_no"),
    lastPayloadHash: text("last_payload_hash"),
    attemptedPayloadHash: text("attempted_payload_hash").notNull(),
    lastRequestId: uuid("last_request_id").notNull(),
    attemptCount: integer("attempt_count").notNull().default(1),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    lastErrorHttpStatus: integer("last_error_http_status"),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("product_publications_product_channel_uidx").on(
      table.productId,
      table.channel,
    ),
    index("product_publications_status_idx").on(table.status, table.updatedAt),
    check(
      "product_publications_channel_check",
      sql`${table.channel} in ('naver')`,
    ),
    check(
      "product_publications_last_payload_hash_check",
      sql`${table.lastPayloadHash} is null or ${table.lastPayloadHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "product_publications_attempted_payload_hash_check",
      sql`${table.attemptedPayloadHash} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      "product_publications_attempt_count_positive",
      sql`${table.attemptCount} > 0`,
    ),
  ],
);

export const keywordManagedProducts = pgTable(
  "keyword_managed_products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => userProfiles.userId, { onDelete: "cascade" }),
    linkedProductId: uuid("linked_product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    smartstoreUrl: text("smartstore_url").notNull(),
    channelProductNo: text("channel_product_no"),
    supplierTitle: text("supplier_title").notNull(),
    currentTitle: text("current_title"),
    editableTitle: text("editable_title").notNull(),
    finalTitle: text("final_title"),
    productInput: jsonb("product_input")
      .$type<ManagedProductInput>()
      .notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("keyword_managed_products_owner_updated_idx").on(
      table.ownerId,
      table.updatedAt,
    ),
    uniqueIndex("keyword_managed_products_owner_channel_uidx")
      .on(table.ownerId, table.channelProductNo)
      .where(sql`${table.channelProductNo} is not null`),
    check(
      "keyword_managed_products_status_check",
      sql`${table.status} in ('active', 'archived')`,
    ),
  ],
);

export const productKeywordAnalyses = pgTable(
  "product_keyword_analyses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => userProfiles.userId, { onDelete: "cascade" }),
    managedProductId: uuid("managed_product_id")
      .notNull()
      .references(() => keywordManagedProducts.id, { onDelete: "cascade" }),
    inputHash: text("input_hash").notNull(),
    analysis: jsonb("analysis").$type<ProductAnalysisData>().notNull(),
    model: text("model").notNull(),
    source: externalDataSourceEnum("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("product_keyword_analyses_product_created_idx").on(
      table.managedProductId,
      table.createdAt,
    ),
    index("product_keyword_analyses_owner_idx").on(table.ownerId),
    check(
      "product_keyword_analyses_input_hash_check",
      sql`${table.inputHash} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

export const keywordCandidates = pgTable(
  "keyword_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => userProfiles.userId, { onDelete: "cascade" }),
    managedProductId: uuid("managed_product_id")
      .notNull()
      .references(() => keywordManagedProducts.id, { onDelete: "cascade" }),
    analysisId: uuid("analysis_id").references(() => productKeywordAnalyses.id, {
      onDelete: "set null",
    }),
    keyword: text("keyword").notNull(),
    normalizedKeyword: text("normalized_keyword").notNull(),
    recommendationReason: text("ai_reason").notNull().default(""),
    sourceConcepts: jsonb("source_concepts")
      .$type<string[]>()
      .notNull()
      .default([]),
    recommendationOrder: integer("ai_order").notNull(),
    origin: text("origin").notNull().default("rule_combination"),
    reviewStatus: text("review_status").notNull().default("candidate"),
    filterReasons: jsonb("filter_reasons").$type<string[]>().notNull().default([]),
    relevanceScore: integer("relevance_score"),
    monthlyPcSearchVolume: integer("monthly_pc_search_volume"),
    monthlyMobileSearchVolume: integer("monthly_mobile_search_volume"),
    totalMonthlySearchVolume: integer("total_monthly_search_volume"),
    rawMonthlyPcSearchVolume: text("raw_monthly_pc_search_volume"),
    rawMonthlyMobileSearchVolume: text("raw_monthly_mobile_search_volume"),
    competition: keywordCompetitionEnum("competition")
      .notNull()
      .default("unknown"),
    keywordSize: keywordSizeEnum("keyword_size")
      .notNull()
      .default("unclassified"),
    metricsStatus: keywordMetricsStatusEnum("metrics_status")
      .notNull()
      .default("pending"),
    metricsSource: externalDataSourceEnum("metrics_source"),
    metricsFetchedAt: timestamp("metrics_fetched_at", { withTimezone: true }),
    isSelected: boolean("is_selected").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("keyword_candidates_product_normalized_uidx").on(
      table.managedProductId,
      table.normalizedKeyword,
    ),
    index("keyword_candidates_product_order_idx").on(
      table.managedProductId,
      table.recommendationOrder,
    ),
    index("keyword_candidates_owner_idx").on(table.ownerId),
    check(
      "keyword_candidates_ai_order_non_negative",
      sql`${table.recommendationOrder} >= 0`,
    ),
    check(
      "keyword_candidates_origin_check",
      sql`${table.origin} in ('rule_combination', 'naver_related', 'manual')`,
    ),
    check(
      "keyword_candidates_review_status_check",
      sql`${table.reviewStatus} in ('candidate', 'accepted', 'rejected', 'review')`,
    ),
    check(
      "keyword_candidates_metrics_non_negative",
      sql`(${table.monthlyPcSearchVolume} is null or ${table.monthlyPcSearchVolume} >= 0)
        and (${table.monthlyMobileSearchVolume} is null or ${table.monthlyMobileSearchVolume} >= 0)
        and (${table.totalMonthlySearchVolume} is null or ${table.totalMonthlySearchVolume} >= 0)`,
    ),
  ],
);

export const generatedTitles = pgTable(
  "generated_titles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => userProfiles.userId, { onDelete: "cascade" }),
    managedProductId: uuid("managed_product_id")
      .notNull()
      .references(() => keywordManagedProducts.id, { onDelete: "cascade" }),
    selectedKeywords: jsonb("selected_keywords")
      .$type<string[]>()
      .notNull()
      .default([]),
    generatedTitle: text("generated_title").notNull(),
    editedTitle: text("edited_title").notNull(),
    model: text("model").notNull(),
    source: externalDataSourceEnum("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("generated_titles_product_created_idx").on(
      table.managedProductId,
      table.createdAt,
    ),
    index("generated_titles_owner_idx").on(table.ownerId),
  ],
);

export const keywordMetricCache = pgTable(
  "keyword_metric_cache",
  {
    normalizedKeyword: text("normalized_keyword").primaryKey(),
    metrics: jsonb("metrics").$type<CachedKeywordMetrics>().notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("keyword_metric_cache_expires_idx").on(table.expiresAt)],
);

export type SourcingResearchSignal = "yes" | "no" | "unknown";
export interface SourcingResearchSignals {
  widePriceSpectrum: SourcingResearchSignal;
  manyCustomerPainPoints: SourcingResearchSignal;
  mainKeywordDominant: SourcingResearchSignal;
  strongBrandMarket: SourcingResearchSignal;
  expertiseRequired: SourcingResearchSignal;
  trendDriven: SourcingResearchSignal;
  domesticProductsDominant: SourcingResearchSignal;
  manySkus: SourcingResearchSignal;
  seasonal: SourcingResearchSignal;
  bulky: SourcingResearchSignal;
  certificationRequired: SourcingResearchSignal;
}
export interface SourcingSampleData {
  id: string;
  url: string;
  price: number | null;
  features: string;
}
export type SourcingResearchStatus =
  | "researching"
  | "candidate"
  | "sample_ordered"
  | "selected"
  | "rejected";

export const sourcingResearches = pgTable(
  "sourcing_researches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => userProfiles.userId, { onDelete: "cascade" }),
    status: text("status")
      .$type<SourcingResearchStatus>()
      .notNull()
      .default("researching"),
    sourcingKeyword: text("sourcing_keyword").notNull(),
    monthlySearchVolume: integer("monthly_search_volume"),
    sixMonthRevenue: bigint("six_month_revenue", { mode: "number" }),
    marketNotes: text("market_notes").notNull().default(""),
    coupangAveragePrice: integer("coupang_average_price"),
    naverAveragePrice: integer("naver_average_price"),
    expectedSellingPrice: integer("expected_selling_price"),
    maximumPurchasePrice: integer("maximum_purchase_price"),
    signals: jsonb("signals").$type<SourcingResearchSignals>().notNull(),
    finalSellingPoint: text("final_selling_point").notNull().default(""),
    positiveReviews: text("positive_reviews").notNull().default(""),
    negativeReviews: text("negative_reviews").notNull().default(""),
    customerNeeds: text("customer_needs").notNull().default(""),
    productSpecs: text("product_specs").notNull().default(""),
    primaryTarget: text("primary_target").notNull().default(""),
    referenceNotes: text("reference_notes").notNull().default(""),
    samples: jsonb("samples").$type<SourcingSampleData[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("sourcing_researches_owner_updated_idx").on(
      table.ownerId,
      table.updatedAt,
    ),
    check(
      "sourcing_researches_status_check",
      sql`${table.status} in ('researching', 'candidate', 'sample_ordered', 'selected', 'rejected')`,
    ),
    check(
      "sourcing_researches_amounts_non_negative",
      sql`(${table.monthlySearchVolume} is null or ${table.monthlySearchVolume} >= 0)
        and (${table.sixMonthRevenue} is null or ${table.sixMonthRevenue} >= 0)
        and (${table.coupangAveragePrice} is null or ${table.coupangAveragePrice} >= 0)
        and (${table.naverAveragePrice} is null or ${table.naverAveragePrice} >= 0)
        and (${table.expectedSellingPrice} is null or ${table.expectedSellingPrice} >= 0)
        and (${table.maximumPurchasePrice} is null or ${table.maximumPurchasePrice} >= 0)`,
    ),
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
export type ProductPublicationRow = typeof productPublications.$inferSelect;

export type SupplierProductRow = typeof supplierProducts.$inferSelect;

export type NaverCommerceCategoryRow =
  typeof naverCommerceCategories.$inferSelect;
