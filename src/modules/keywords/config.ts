import type { KeywordThresholds } from "./types";

export const keywordThresholds: KeywordThresholds = {
  smallMin: 1,
  smallMax: 1_000,
  mediumMin: 1_001,
  mediumMax: 9_999,
  largeMin: 10_000,
};

export const keywordLimits = {
  maximumCandidates: 50,
  maximumKeywordLength: 40,
  maximumMetricsRequest: 50,
  maximumSelectedKeywords: 20,
  maximumProductTitleLength: 200,
  maximumDescriptionLength: 20_000,
  maximumMemoLength: 2_000,
} as const;

export function validateKeywordThresholds(thresholds: KeywordThresholds) {
  return (
    Number.isInteger(thresholds.smallMin) &&
    thresholds.smallMin >= 0 &&
    thresholds.smallMax + 1 === thresholds.mediumMin &&
    thresholds.mediumMax + 1 === thresholds.largeMin &&
    thresholds.smallMin <= thresholds.smallMax &&
    thresholds.mediumMin <= thresholds.mediumMax
  );
}

if (!validateKeywordThresholds(keywordThresholds)) {
  throw new Error("invalid_keyword_thresholds");
}
