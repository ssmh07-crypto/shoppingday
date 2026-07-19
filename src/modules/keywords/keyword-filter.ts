import { normalizeKeyword } from "./keyword-utils";
import type { KeywordCandidateRecord, KeywordFilterState } from "./types";

export const defaultKeywordFilters: KeywordFilterState = {
  size: "all",
  minimumVolume: 0,
  maximumVolume: null,
  competition: "all",
  search: "",
  selectedOnly: false,
  sort: "recommended",
};

export function filterAndSortKeywords(
  items: KeywordCandidateRecord[],
  filters: KeywordFilterState,
) {
  const search = normalizeKeyword(filters.search);
  return items
    .filter((item) => filters.size === "all" || item.keywordSize === filters.size)
    .filter(
      (item) =>
        filters.competition === "all" || item.competition === filters.competition,
    )
    .filter((item) => !filters.selectedOnly || item.isSelected)
    .filter((item) => !search || normalizeKeyword(item.keyword).includes(search))
    .filter((item) => {
      const total = item.totalMonthlySearchVolume;
      if (total == null) return filters.minimumVolume === 0 && filters.maximumVolume == null;
      return (
        total >= filters.minimumVolume &&
        (filters.maximumVolume == null || total <= filters.maximumVolume)
      );
    })
    .sort((left, right) => compareKeyword(left, right, filters.sort));
}

function compareKeyword(
  left: KeywordCandidateRecord,
  right: KeywordCandidateRecord,
  sort: KeywordFilterState["sort"],
) {
  if (sort === "keyword-asc") return left.keyword.localeCompare(right.keyword, "ko");
  if (sort === "total-desc")
    return compareNullable(
      left.totalMonthlySearchVolume,
      right.totalMonthlySearchVolume,
      "desc",
    );
  if (sort === "total-asc")
    return compareNullable(left.totalMonthlySearchVolume, right.totalMonthlySearchVolume, "asc");
  if (sort === "pc-desc")
    return compareNullable(left.monthlyPcSearchVolume, right.monthlyPcSearchVolume, "desc");
  if (sort === "mobile-desc")
    return compareNullable(
      left.monthlyMobileSearchVolume,
      right.monthlyMobileSearchVolume,
      "desc",
    );
  return left.recommendationOrder - right.recommendationOrder;
}

function compareNullable(
  left: number | null,
  right: number | null,
  direction: "asc" | "desc",
) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;
  return direction === "asc" ? left - right : right - left;
}
