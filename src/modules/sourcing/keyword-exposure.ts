import type {
  SourcingKeywordPlacement,
  SourcingRelatedKeyword,
} from "./types";

export const DEFAULT_TITLE_EXPOSURE_THRESHOLD_PERCENT = 50;
export const AUTOMATIC_PRIMARY_TITLE_KEYWORD_COUNT = 3;
export const AUTOMATIC_ADDITIONAL_TITLE_KEYWORD_COUNT = 7;
export const AUTOMATIC_TITLE_KEYWORD_LIMIT = 10;

export type KeywordExposureStatus = "completed" | "blocked" | "failed";

export type KeywordExposureSample = {
  title: string;
  matchedIn: Array<"product_name" | "attribute" | "category">;
  evidence: string;
  category?: string;
  contextMatched?: boolean;
  contextCategoryMatched?: boolean;
};

export type KeywordExposureResult = {
  keyword: string;
  device: "pc";
  status: KeywordExposureStatus;
  productCount: number;
  titleMatchCount: number;
  attributeMatchCount: number;
  categoryMatchCount: number;
  contextKeyword: string;
  contextMatchCount: number;
  contextCategoryId: string;
  contextCategoryName: string;
  contextCategoryMatchCount: number;
  categoryDistribution: Array<{ category: string; count: number }>;
  observedAt: string;
  samples: KeywordExposureSample[];
  message: string | null;
};

export type KeywordPlacementRecommendation = {
  placement: Exclude<SourcingKeywordPlacement, "unclassified">;
  titleThresholdCount: number;
  reason: string;
};

export type KeywordContextAssessment = {
  mismatched: boolean;
  thresholdCount: number;
  reason: string | null;
};

export type AutomaticKeywordPlacementInput = {
  item: Pick<
    SourcingRelatedKeyword,
    "id" | "keyword" | "monthlySearchVolume"
  >;
  recommendation: KeywordPlacementRecommendation | null;
  tagDictionary: NaverTagDictionaryResult;
  officialAttribute: SourcingRelatedKeyword["officialAttribute"];
  requiresReview: boolean;
};

export type AutomaticKeywordPlacementAllocation = {
  placements: Record<string, SourcingKeywordPlacement>;
  productNameKeywordIds: string[];
  titleKeywordIds: string[];
  tagKeywordIds: string[];
};

export function selectAutomaticTitleKeywordIds(
  items: Array<Pick<SourcingRelatedKeyword, "id" | "keyword" | "monthlySearchVolume">>,
) {
  const orderedTitleCandidates = items
    .filter((item) =>
      item.monthlySearchVolume !== null && item.monthlySearchVolume >= 100
    )
    .sort((left, right) =>
      (right.monthlySearchVolume ?? 0) - (left.monthlySearchVolume ?? 0) ||
      left.keyword.localeCompare(right.keyword, "ko-KR")
    );
  const primaryTitleCandidates = orderedTitleCandidates.slice(
    0,
    AUTOMATIC_PRIMARY_TITLE_KEYWORD_COUNT,
  );
  const primaryTitleIds = new Set(
    primaryTitleCandidates.map((item) => item.id),
  );
  const additionalTitleCandidates = orderedTitleCandidates
    .filter((item) =>
      !primaryTitleIds.has(item.id) &&
      item.monthlySearchVolume !== null &&
      item.monthlySearchVolume <= 1_000
    )
    .slice(0, AUTOMATIC_ADDITIONAL_TITLE_KEYWORD_COUNT);
  return [...primaryTitleCandidates, ...additionalTitleCandidates]
    .slice(0, AUTOMATIC_TITLE_KEYWORD_LIMIT)
    .map((item) => item.id);
}

export type NaverTagDictionaryResult = {
  keyword: string;
  status: "registered" | "unregistered" | "unavailable";
  exactTag: { code: number; text: string } | null;
  candidates: Array<{ code: number; text: string }>;
  message: string | null;
};

export function assessKeywordContext(
  result: KeywordExposureResult,
  minimumRelevantPercent = 20,
): KeywordContextAssessment {
  const normalizedThreshold = Math.min(
    100,
    Math.max(1, Math.round(minimumRelevantPercent)),
  );
  const thresholdCount = Math.max(
    1,
    Math.ceil((result.productCount * normalizedThreshold) / 100),
  );
  const relevantCount = result.contextCategoryId
    ? result.contextCategoryMatchCount
    : result.contextMatchCount;
  const mismatched =
    result.status === "completed" &&
    result.productCount > 0 &&
    Boolean(result.contextKeyword.trim()) &&
    relevantCount < thresholdCount;
  return {
    mismatched,
    thresholdCount,
    reason: mismatched
      ? result.contextCategoryId
        ? `검색 결과 중 선택 카테고리 '${result.contextCategoryName}'와 일치한 상품이 ${result.contextCategoryMatchCount}/${result.productCount}건뿐이라 검색 의도 불일치 가능성이 있습니다. 자동 분류하지 않고 확인 필요로 남깁니다.`
        : `검색 결과 중 기준 상품어 '${result.contextKeyword}'와 연결된 상품이 ${result.contextMatchCount}/${result.productCount}건뿐이라 검색 의도 불일치 가능성이 있습니다. 자동 분류하지 않고 확인 필요로 남깁니다.`
      : null,
  };
}

export function recommendKeywordPlacement(
  result: KeywordExposureResult,
  titleThresholdPercent = DEFAULT_TITLE_EXPOSURE_THRESHOLD_PERCENT,
  tagDictionary?: NaverTagDictionaryResult,
  officialAttribute?: SourcingRelatedKeyword["officialAttribute"],
): KeywordPlacementRecommendation | null {
  if (result.status !== "completed" || result.productCount < 1) return null;
  const contextMismatched = assessKeywordContext(result).mismatched;
  const normalizedThreshold = Math.min(
    100,
    Math.max(1, Math.round(titleThresholdPercent)),
  );
  const titleThresholdCount = Math.max(
    1,
    Math.ceil((result.productCount * normalizedThreshold) / 100),
  );

  if (contextMismatched) {
    if (officialAttribute) {
      return {
        placement: "attribute",
        titleThresholdCount,
        reason: `단독 검색 결과는 선택 카테고리와 다르지만, 선택 카테고리 공식 속성 연결값은 '${officialAttribute.attributeName} > ${officialAttribute.attributeValueName}'이므로 속성 키워드로 추천합니다.`,
      };
    }
    if (tagDictionary?.status === "registered") {
      return {
        placement: "tag",
        titleThresholdCount,
        reason: `단독 검색 결과는 선택 카테고리와 다르지만, 네이버 추천 태그사전에서 '${tagDictionary.exactTag?.text ?? result.keyword}'의 정확 일치 태그를 확인해 태그 키워드로 추천합니다.`,
      };
    }
    return null;
  }

  if (result.titleMatchCount >= titleThresholdCount) {
    return {
      placement: "product_name",
      titleThresholdCount,
      reason: `상품명 ${result.titleMatchCount}/${result.productCount}건으로 설정한 ${normalizedThreshold}% 기준을 충족했습니다.`,
    };
  }
  if (officialAttribute) {
    return {
      placement: "attribute",
      titleThresholdCount,
      reason: `상품명 기준에는 미달했고 선택 카테고리의 공식 속성 '${officialAttribute.attributeName} > ${officialAttribute.attributeValueName}'과 연결됐습니다.`,
    };
  }
  if (tagDictionary?.status === "registered") {
    return {
      placement: "tag",
      titleThresholdCount,
      reason: `상품명 기준에는 미달했고 네이버 추천 태그사전에서 '${tagDictionary.exactTag?.text ?? result.keyword}'의 정확 일치 태그를 확인했습니다.`,
    };
  }
  if (result.categoryMatchCount > 0) {
    return {
      placement: "category",
      titleThresholdCount,
      reason: `상품명·공식 속성·공식 태그 기준에는 해당하지 않았고 카테고리 영역에서 ${result.categoryMatchCount}건 확인됐습니다.`,
    };
  }
  return {
    placement: "product_name",
    titleThresholdCount,
    reason: "공식 속성·공식 태그·카테고리에 해당하지 않아 상품명 후보로 분류했습니다.",
  };
}

export function keywordPlacementReviewReason(
  result: KeywordExposureResult,
  tagDictionary?: NaverTagDictionaryResult,
) {
  const contextAssessment = assessKeywordContext(result);
  if (contextAssessment.reason) return contextAssessment.reason;
  if (tagDictionary?.status === "unavailable") return tagDictionary.message;
  return null;
}

export function allocateAutomaticKeywordPlacements(
  analyses: AutomaticKeywordPlacementInput[],
): AutomaticKeywordPlacementAllocation {
  const titleCandidates = analyses
    .filter(({ recommendation }) =>
      recommendation?.placement === "product_name"
    )
    .map(({ item }) => item);
  const titleKeywordIds = selectAutomaticTitleKeywordIds(titleCandidates);
  const placements: Record<string, SourcingKeywordPlacement> = {};

  for (const analysis of analyses) {
    const { item, recommendation } = analysis;
    if (!recommendation) {
      placements[item.id] = "unclassified";
      continue;
    }
    placements[item.id] = recommendation.placement;
  }

  return {
    placements,
    productNameKeywordIds: analyses
      .filter(({ item }) => placements[item.id] === "product_name")
      .map(({ item }) => item.id),
    titleKeywordIds,
    tagKeywordIds: analyses
      .filter(({ item, tagDictionary }) =>
        (placements[item.id] === "product_name" || placements[item.id] === "tag") &&
        tagDictionary.status === "registered" &&
        Boolean(tagDictionary.exactTag)
      )
      .sort((left, right) =>
        (right.item.monthlySearchVolume ?? -1) -
          (left.item.monthlySearchVolume ?? -1) ||
        left.item.keyword.localeCompare(right.item.keyword, "ko-KR")
      )
      .map(({ item }) => item.id),
  };
}
