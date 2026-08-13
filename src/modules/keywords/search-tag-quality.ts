import { normalizeKeyword } from "./keyword-utils";
import type { RefinementCtx } from "zod";

export const promotionalSearchTagTerms = [
  "무료배송",
  "배송",
  "정품",
  "신상품",
  "인기",
  "추천",
  "특가",
  "할인",
  "이벤트",
  "국내배송",
  "당일배송",
  "1+1",
] as const;

export type SearchTagQualityIssue = {
  code: "promotional-term" | "duplicate-product-info";
  message: string;
};

export function isBlockingSearchTagIssue(issue: SearchTagQualityIssue) {
  return issue.code === "promotional-term";
}

export function assessSearchTag(
  tag: string,
  context: { title?: string } = {},
): SearchTagQualityIssue[] {
  const normalizedTag = compactKeyword(tag);
  if (!normalizedTag) return [];
  const issues: SearchTagQualityIssue[] = [];
  const promotionalTerms = promotionalSearchTagTerms.filter((term) =>
    normalizedTag.includes(compactKeyword(term)),
  );
  if (promotionalTerms.length) {
    issues.push({
      code: "promotional-term",
      message: `배송·할인 등 홍보 문구는 검색 태그로 사용하지 않습니다: ${promotionalTerms.join(", ")}`,
    });
  }
  const normalizedTitle = compactKeyword(context.title ?? "");
  if (
    normalizedTitle &&
    normalizedTag.length >= 2 &&
    normalizedTitle.includes(normalizedTag)
  ) {
    issues.push({
      code: "duplicate-product-info",
      message: "상품명에 이미 포함된 정보는 검색 태그에서 중복하지 않습니다.",
    });
  }
  return issues;
}

export function addSearchTagQualityIssues(
  context: RefinementCtx,
  searchTags: string[],
  title: string,
) {
  searchTags.forEach((tag, index) => {
    for (const issue of assessSearchTag(tag, { title }).filter(
      isBlockingSearchTagIssue,
    )) {
      context.addIssue({
        code: "custom",
        path: ["searchTags", index],
        message: issue.message,
      });
    }
  });
}

function compactKeyword(value: string) {
  return normalizeKeyword(value).replace(/\s+/g, "");
}
