export type SourcingResearchStatus =
  | "researching"
  | "candidate"
  | "sample_ordered"
  | "selected"
  | "rejected";

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

export interface SourcingSample {
  id: string;
  url: string;
  price: number | null;
  features: string;
}

export type SourcingKeywordPlacement =
  | "unclassified"
  | "product_name"
  | "tag"
  | "attribute"
  | "category";

export interface SourcingRelatedKeyword {
  id: string;
  keyword: string;
  normalizedKeyword: string;
  monthlySearchVolume: number | null;
  placement: SourcingKeywordPlacement;
  source: "itemscout-xlsx";
  importedAt: string;
}

export interface SourcingResearchInput {
  status: SourcingResearchStatus;
  sourcingKeyword: string;
  monthlySearchVolume: number | null;
  sixMonthRevenue: number | null;
  marketNotes: string;
  coupangAveragePrice: number | null;
  naverAveragePrice: number | null;
  expectedSellingPrice: number | null;
  signals: SourcingResearchSignals;
  finalSellingPoint: string;
  positiveReviews: string;
  negativeReviews: string;
  customerNeeds: string;
  productSpecs: string;
  primaryTarget: string;
  referenceNotes: string;
  relatedKeywords: SourcingRelatedKeyword[];
  samples: SourcingSample[];
}

export interface SourcingResearchRecord extends SourcingResearchInput {
  id: string;
  maximumPurchasePrice: number | null;
  registrationProductId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const defaultSourcingSignals: SourcingResearchSignals = {
  widePriceSpectrum: "unknown",
  manyCustomerPainPoints: "unknown",
  mainKeywordDominant: "unknown",
  strongBrandMarket: "unknown",
  expertiseRequired: "unknown",
  trendDriven: "unknown",
  domesticProductsDominant: "unknown",
  manySkus: "unknown",
  seasonal: "unknown",
  bulky: "unknown",
  certificationRequired: "unknown",
};
