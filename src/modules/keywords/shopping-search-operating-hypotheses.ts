export const shoppingSearchOperatingHypotheses = {
  evidenceStatus: "user-operating-hypothesis",
  rankingFormulaLabel: "적합도 × 인기도 × 신뢰도",
  plusStoreRankingFormulaLabel: "적합도 × 인기도 × 신뢰도 × 선호도",
  fieldPriority: ["상품명", "스토어명", "카테고리", "속성", "태그"],
  resultPageSize: 40,
  plusStorePersonalizedResults: true,
  uniformResultsAssumptionScope: "price-comparison-sampling-only",
  popularityWindowLabel: "최근 1개월",
  beginnerMaximumMonthlySearchVolume: 1_000,
} as const;

export function calculateOperatingHypothesisScore(input: {
  popularity: number | null;
  relevance: number | null;
  trust: number | null;
  surface?: "price-comparison" | "plus-store";
  preference?: number | null;
}) {
  if (
    input.popularity == null ||
    input.relevance == null ||
    input.trust == null
  ) return null;
  if ([input.popularity, input.relevance, input.trust].some((value) => value < 0)) {
    throw new Error("operating_hypothesis_score_must_be_non_negative");
  }
  const commonScore = input.popularity * input.relevance * input.trust;
  if (input.surface !== "plus-store") return commonScore;
  if (input.preference == null) return null;
  if (input.preference < 0) {
    throw new Error("operating_hypothesis_score_must_be_non_negative");
  }
  return commonScore * input.preference;
}
