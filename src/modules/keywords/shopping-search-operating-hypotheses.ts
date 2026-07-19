export const shoppingSearchOperatingHypotheses = {
  evidenceStatus: "user-operating-hypothesis",
  rankingFormulaLabel: "인기도 × 적합도 × 신뢰도",
  fieldPriority: ["상품명", "스토어명", "카테고리", "속성", "태그"],
  resultPageSize: 40,
  assumeUniformResults: true,
  beginnerMaximumMonthlySearchVolume: 1_000,
} as const;

export function calculateOperatingHypothesisScore(input: {
  popularity: number | null;
  relevance: number | null;
  trust: number | null;
}) {
  if (
    input.popularity == null ||
    input.relevance == null ||
    input.trust == null
  ) return null;
  if ([input.popularity, input.relevance, input.trust].some((value) => value < 0)) {
    throw new Error("operating_hypothesis_score_must_be_non_negative");
  }
  return input.popularity * input.relevance * input.trust;
}
