import type { SourcingRelatedKeyword } from "./types";

const TITLE_LIMIT = 200;
const TAG_LIMIT = 20;
const TAG_LENGTH_LIMIT = 30;

export interface SourcingRegistrationDraft {
  title: string;
  searchTags: string[];
  attributeKeywords: string[];
  categoryKeywords: string[];
  warnings: string[];
}

export function buildSourcingRegistrationDraft(
  sourcingKeyword: string,
  relatedKeywords: SourcingRelatedKeyword[],
): SourcingRegistrationDraft {
  const titleKeywords = eligibleLowVolumeKeywords(relatedKeywords, "product_name");
  const tagKeywords = eligibleLowVolumeKeywords(relatedKeywords, "tag");
  const attributeKeywords = sortedKeywords(relatedKeywords, "attribute");
  const categoryKeywords = sortedKeywords(relatedKeywords, "category");
  const warnings: string[] = [];

  const title = composeTitle(sourcingKeyword, titleKeywords).slice(0, TITLE_LIMIT).trim();
  const searchTags = uniqueKeywords(tagKeywords)
    .filter((keyword) => keyword.length <= TAG_LENGTH_LIMIT)
    .slice(0, TAG_LIMIT);

  if (!titleKeywords.length) {
    warnings.push("검색수 1,000 이하로 분류된 상품명 키워드가 없습니다.");
  }
  if (tagKeywords.some((keyword) => keyword.length > TAG_LENGTH_LIMIT)) {
    warnings.push("30자를 넘는 태그 키워드는 자동 반영에서 제외했습니다.");
  }
  if (tagKeywords.length > TAG_LIMIT) {
    warnings.push("검색 태그는 검색수 우선순위에 따라 최대 20개만 반영합니다.");
  }
  if (attributeKeywords.length) {
    warnings.push("속성 키워드는 네이버 카테고리의 공식 속성값과 직접 대조해야 합니다.");
  }
  if (categoryKeywords.length) {
    warnings.push("카테고리 키워드는 상품명에 포함하지 않고 카테고리 선택 참고값으로만 사용합니다.");
  }

  return {
    title,
    searchTags,
    attributeKeywords,
    categoryKeywords,
    warnings,
  };
}

export function categoryKeywordsInTitle(title: string, categoryKeywords: string[]) {
  const titleTokens = title
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  return categoryKeywords.filter((keyword) => {
    const keywordTokens = keyword
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    if (!keywordTokens.length || keywordTokens.length > titleTokens.length) return false;
    return titleTokens.some((_, index) =>
      keywordTokens.every((token, offset) => titleTokens[index + offset] === token),
    );
  });
}

function eligibleLowVolumeKeywords(
  keywords: SourcingRelatedKeyword[],
  placement: "product_name" | "tag",
) {
  return keywords
    .filter(
      (keyword) =>
        keyword.placement === placement &&
        keyword.monthlySearchVolume !== null &&
        keyword.monthlySearchVolume <= 1_000,
    )
    .sort(compareByVolumeThenKeyword)
    .map((keyword) => keyword.keyword);
}

function sortedKeywords(
  keywords: SourcingRelatedKeyword[],
  placement: "attribute" | "category",
) {
  return uniqueKeywords(
    keywords
      .filter((keyword) => keyword.placement === placement)
      .sort(compareByVolumeThenKeyword)
      .map((keyword) => keyword.keyword),
  );
}

function compareByVolumeThenKeyword(
  left: SourcingRelatedKeyword,
  right: SourcingRelatedKeyword,
) {
  const volumeDifference =
    (right.monthlySearchVolume ?? -1) - (left.monthlySearchVolume ?? -1);
  return volumeDifference || left.keyword.localeCompare(right.keyword, "ko");
}

function composeTitle(sourcingKeyword: string, keywords: string[]) {
  const unique = uniqueKeywords(keywords);
  if (!unique.length) return "";

  const sourceNormalized = normalizeKeyword(sourcingKeyword);
  const base =
    unique.find((keyword) => normalizeKeyword(keyword) === sourceNormalized) ??
    (sourceNormalized && unique.some((keyword) => normalizeKeyword(keyword).includes(sourceNormalized))
      ? sourcingKeyword.trim()
      : [...unique].sort(
          (left, right) => normalizeKeyword(left).length - normalizeKeyword(right).length,
        )[0]);
  const baseNormalized = normalizeKeyword(base);
  const modifiers: string[] = [];

  for (const keyword of unique) {
    const normalized = normalizeKeyword(keyword);
    if (normalized === baseNormalized) continue;
    const remainder = normalized.replace(baseNormalized, "").trim();
    if (remainder && !modifiers.some((item) => normalizeKeyword(item) === remainder)) {
      modifiers.push(remainder);
    }
  }

  return [...modifiers, base].filter(Boolean).join(" ");
}

function uniqueKeywords(keywords: string[]) {
  const seen = new Set<string>();
  return keywords.filter((keyword) => {
    const normalized = normalizeKeyword(keyword);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function normalizeKeyword(keyword: string) {
  return keyword
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ko-KR");
}
