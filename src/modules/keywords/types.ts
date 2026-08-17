export type KeywordSize = "small" | "medium" | "large" | "unclassified";
export type KeywordCompetition = "low" | "medium" | "high" | "unknown";
export type KeywordMetricsStatus = "pending" | "success" | "not_found" | "error";
export type ExternalDataSource =
  | "rules"
  // 기존 DB 레코드 판독 전용 값이다. 실행 가능한 클라이언트나 선택 경로는 없다.
  | "openai"
  | "naver_search_ad"
  | "naver_api_hub"
  | "mock";

export interface KeywordThresholds {
  smallMin: number;
  smallMax: number;
  mediumMin: number;
  mediumMax: number;
  largeMin: number;
}

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
  naverAttributes?: NaverRegisteredAttribute[];
  searchTags?: string[];
  commerceImport?: NaverCommerceImportState;
  salePrice?: number | null;
  stockQuantity?: number | null;
  statusType?: string;
  representativeImageUrl?: string;
  salesSummary?: ManagedProductSalesSummary;
  supplierAvailabilityCheck?: SupplierAvailabilityCheck;
}

export interface NaverRegisteredAttribute {
  attributeSeq: number;
  attributeName: string;
  attributeValueSeq: number | null;
  value: string;
  minValue?: string;
  maxValue?: string;
  unitCode?: string | null;
}

export interface ManagedProductSalesSummary {
  sevenDays: number;
  thirtyDays: number;
  fetchedAt: string;
  source: "naver_orders";
}

export interface SupplierAvailabilityCheck {
  provider: "zicgam";
  status:
    | "available"
    | "partial_sold_out"
    | "sold_out"
    | "discontinued"
    | "auth_required"
    | "unknown"
    | "failed";
  productName: string | null;
  checkedAt: string;
  source: "chrome_extension";
  url: string;
  evidence: string[];
  availableOptions: string[];
  soldOutOptions: string[];
}

export interface NaverCommerceImportState {
  status: "success" | "failed" | "not_configured";
  fetchedAt: string | null;
  message: string | null;
}

export interface ProductAnalysis {
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

export interface GeneratedKeywordCandidate {
  keyword: string;
  reason: string;
  sourceConcepts: string[];
  origin?: "rule_combination" | "naver_related" | "manual";
  reviewStatus?: "candidate" | "accepted" | "rejected" | "review";
  filterReasons?: string[];
  relevanceScore?: number | null;
}

export interface AnalysisResult {
  productAnalysis: ProductAnalysis;
  keywordCandidates: GeneratedKeywordCandidate[];
  model: string;
  source: "rules" | "mock";
}

export interface KeywordMetrics {
  keyword: string;
  monthlyPcSearchVolume: number | null;
  monthlyMobileSearchVolume: number | null;
  totalMonthlySearchVolume: number | null;
  rawMonthlyPcSearchVolume: string | number | null;
  rawMonthlyMobileSearchVolume: string | number | null;
  competition: KeywordCompetition;
  fetchedAt: string;
  source: "naver-search-ad" | "mock";
  status: "success" | "not-found" | "error";
}

export interface KeywordCandidateRecord {
  id: string;
  keyword: string;
  normalizedKeyword: string;
  recommendationReason: string;
  sourceConcepts: string[];
  recommendationOrder: number;
  origin: "rule_combination" | "naver_related" | "manual";
  reviewStatus: "candidate" | "accepted" | "rejected" | "review";
  filterReasons: string[];
  relevanceScore: number | null;
  monthlyPcSearchVolume: number | null;
  monthlyMobileSearchVolume: number | null;
  totalMonthlySearchVolume: number | null;
  rawMonthlyPcSearchVolume: string | null;
  rawMonthlyMobileSearchVolume: string | null;
  competition: KeywordCompetition;
  keywordSize: KeywordSize;
  metricsStatus: KeywordMetricsStatus;
  metricsSource: ExternalDataSource | null;
  metricsFetchedAt: Date | null;
  isSelected: boolean;
}

export interface ManagedProductSummary {
  id: string;
  smartstoreUrl: string;
  channelProductNo: string | null;
  storeConnectionId?: string | null;
  supplierTitle: string;
  editableTitle: string;
  finalTitle: string | null;
  status: string;
  keywordCount: number;
  selectedKeywordCount: number;
  updatedAt: Date;
  supplierUrl?: string;
  salesSummary?: ManagedProductSalesSummary;
  supplierAvailabilityCheck?: SupplierAvailabilityCheck;
}

export interface ManagedProductDetail {
  product: {
    id: string;
    smartstoreUrl: string;
    channelProductNo: string | null;
    storeConnectionId?: string | null;
    linkedProductId: string | null;
    supplierTitle: string;
    currentTitle: string | null;
    editableTitle: string;
    finalTitle: string | null;
    sourceTitleKeywords: string[];
    productInput: ManagedProductInput;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  };
  analysis: {
    id: string;
    analysis: ProductAnalysis;
    model: string;
    source: ExternalDataSource;
    isStale?: boolean;
    createdAt: Date;
  } | null;
  keywords: KeywordCandidateRecord[];
  titles: Array<{
    id: string;
    selectedKeywords: string[];
    generatedTitle: string;
    editedTitle: string;
    model: string;
    source: ExternalDataSource;
    createdAt: Date;
    updatedAt: Date;
  }>;
  rankObservations?: KeywordRankObservation[];
}

export interface KeywordRankObservation {
  id: string;
  keyword: string;
  rank: number | null;
  device: "unknown" | "pc" | "mobile";
  resultStatus: "found" | "not_found" | "blocked" | "failed";
  checkedRange: number;
  checkedAt: Date;
  note: string;
  source: "manual" | "browser_observed";
}

export interface KeywordFilterState {
  size: KeywordSize | "all";
  minimumVolume: number;
  maximumVolume: number | null;
  competition: KeywordCompetition | "all";
  search: string;
  selectedOnly: boolean;
  sort:
    | "recommended"
    | "total-desc"
    | "total-asc"
    | "pc-desc"
    | "mobile-desc"
    | "keyword-asc";
}
