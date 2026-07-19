import { normalizeKeyword, sanitizeKeyword } from "./keyword-utils";

export const promotionalTitleTerms = [
  "무료배송",
  "정품",
  "신상품",
  "인기",
  "추천",
  "특가",
  "할인",
  "이벤트",
  "국내배송",
  "당일배송",
] as const;

export const genericProductTypePattern = /(부자재|용품|상품|제품|세트|도구)$/;

export type TitleQualityIssueCode =
  | "missing-product-type"
  | "duplicate-token"
  | "generic-category"
  | "promotional-term"
  | "long-title";

export type TitleQualityIssue = {
  code: TitleQualityIssueCode;
  message: string;
};

export function assessProductTitle(
  title: string,
  productType: string,
  recommendedMaximumLength = 40,
): TitleQualityIssue[] {
  const cleanTitle = sanitizeKeyword(title);
  if (!cleanTitle) return [];

  const tokens = titleTokens(cleanTitle);
  const normalizedProductType = normalizeKeyword(productType);
  const productTypeIsSpecific =
    Boolean(normalizedProductType) && !genericProductTypePattern.test(productType);
  const issues: TitleQualityIssue[] = [];

  if (
    normalizedProductType &&
    !normalizeKeyword(cleanTitle).includes(normalizedProductType)
  ) {
    issues.push({
      code: "missing-product-type",
      message: `구체적인 상품 유형 '${productType}'이 상품명에 없습니다.`,
    });
  }

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const token of tokens) {
    const normalized = normalizeKeyword(token);
    if (seen.has(normalized)) duplicates.add(token);
    seen.add(normalized);
  }
  if (duplicates.size) {
    issues.push({
      code: "duplicate-token",
      message: `같은 단어가 반복됩니다: ${Array.from(duplicates).join(", ")}`,
    });
  }

  const genericTokens = productTypeIsSpecific
    ? tokens.filter(
        (token) =>
          normalizeKeyword(token) !== normalizedProductType &&
          genericProductTypePattern.test(token),
      )
    : [];
  if (genericTokens.length) {
    issues.push({
      code: "generic-category",
      message: `구체적인 상품 유형과 겹치는 넓은 분류어를 확인하세요: ${genericTokens.join(", ")}`,
    });
  }

  const promotionalTerms = promotionalTitleTerms.filter((term) =>
    normalizeKeyword(cleanTitle).includes(normalizeKeyword(term)),
  );
  if (promotionalTerms.length) {
    issues.push({
      code: "promotional-term",
      message: `홍보성 표현은 상품 속성보다 우선하지 않는 것이 좋습니다: ${promotionalTerms.join(", ")}`,
    });
  }

  if (cleanTitle.length > recommendedMaximumLength) {
    issues.push({
      code: "long-title",
      message: `${recommendedMaximumLength}자를 넘었습니다. 저장은 가능하지만 더 간결하게 다듬어 보세요.`,
    });
  }

  return issues;
}

export function isGenericProductTypeToken(token: string) {
  return genericProductTypePattern.test(token);
}

function titleTokens(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[>｜|/,[\](){}]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter(Boolean);
}
