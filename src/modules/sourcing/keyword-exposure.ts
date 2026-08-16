import type { SourcingKeywordPlacement } from "./types";

export type KeywordExposureStatus = "completed" | "blocked" | "failed";

export type KeywordExposureSample = {
  title: string;
  matchedIn: Array<"product_name" | "attribute" | "category">;
  evidence: string;
};

export type KeywordExposureResult = {
  keyword: string;
  device: "pc";
  status: KeywordExposureStatus;
  productCount: number;
  titleMatchCount: number;
  attributeMatchCount: number;
  categoryMatchCount: number;
  observedAt: string;
  samples: KeywordExposureSample[];
  message: string | null;
};

export type KeywordPlacementRecommendation = {
  placement: Exclude<SourcingKeywordPlacement, "unclassified">;
  titleThresholdCount: number;
  reason: string;
};

export function recommendKeywordPlacement(
  result: KeywordExposureResult,
  titleThresholdPercent = 30,
): KeywordPlacementRecommendation | null {
  if (result.status !== "completed" || result.productCount < 1) return null;
  const normalizedThreshold = Math.min(
    100,
    Math.max(1, Math.round(titleThresholdPercent)),
  );
  const titleThresholdCount = Math.max(
    1,
    Math.ceil((result.productCount * normalizedThreshold) / 100),
  );

  if (result.titleMatchCount >= titleThresholdCount) {
    return {
      placement: "product_name",
      titleThresholdCount,
      reason: `상품명 ${result.titleMatchCount}/${result.productCount}건으로 설정한 ${normalizedThreshold}% 기준을 충족했습니다.`,
    };
  }
  if (result.attributeMatchCount > 0) {
    return {
      placement: "attribute",
      titleThresholdCount,
      reason: `상품명 기준에는 미달했고 상품 카드 부가정보에서 ${result.attributeMatchCount}건 확인됐습니다.`,
    };
  }
  if (result.categoryMatchCount > 0) {
    return {
      placement: "category",
      titleThresholdCount,
      reason: `상품명·부가정보에서는 확인되지 않았고 카테고리 영역에서 ${result.categoryMatchCount}건 확인됐습니다.`,
    };
  }
  return {
    placement: "tag",
    titleThresholdCount,
    reason:
      "상품명·부가정보·카테고리 영역에서 확인되지 않아 태그 후보로 제안합니다. 실제 판매자 태그 사용 여부를 확인한 결과는 아닙니다.",
  };
}

