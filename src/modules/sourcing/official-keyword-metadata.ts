import type { SourcingRelatedKeyword } from "./types";
import type { NaverProductAttribute } from "@/lib/db/schema";

export type OfficialAttributeContext = {
  category: {
    id: string;
    name: string;
    wholeCategoryName: string;
  };
  attributes: Array<{
    attributeSeq: number;
    attributeName: string;
  }>;
  attributeValues: Array<{
    attributeSeq: number;
    attributeValueSeq: number;
    attributeValueName?: string;
  }>;
};

export function matchOfficialAttributeKeyword(
  keyword: string,
  context: OfficialAttributeContext,
): NonNullable<SourcingRelatedKeyword["officialAttribute"]> | null {
  const normalizedKeyword = normalize(keyword);
  if (!normalizedKeyword) return null;
  const matches = context.attributeValues.flatMap((value) => {
    const valueName = value.attributeValueName?.trim() ?? "";
    const normalizedValue = normalize(valueName);
    if (
      normalizedValue.length < 2 ||
      (!normalizedKeyword.includes(normalizedValue) &&
        !normalizedValue.includes(normalizedKeyword))
    ) {
      return [];
    }
    const attribute = context.attributes.find(
      (item) => item.attributeSeq === value.attributeSeq,
    );
    if (!attribute?.attributeName.trim()) return [];
    return [{
      categoryId: context.category.id,
      categoryName:
        context.category.wholeCategoryName || context.category.name,
      attributeSeq: attribute.attributeSeq,
      attributeName: attribute.attributeName,
      attributeValueSeq: value.attributeValueSeq,
      attributeValueName: valueName,
      exact: normalizedKeyword === normalizedValue,
      length: normalizedValue.length,
    }];
  });
  matches.sort(
    (left, right) =>
      Number(right.exact) - Number(left.exact) ||
      right.length - left.length ||
      left.attributeSeq - right.attributeSeq,
  );
  const match = matches[0];
  if (!match) return null;
  return {
    categoryId: match.categoryId,
    categoryName: match.categoryName,
    attributeSeq: match.attributeSeq,
    attributeName: match.attributeName,
    attributeValueSeq: match.attributeValueSeq,
    attributeValueName: match.attributeValueName,
  };
}

export function mergeOfficialKeywordAttributes(
  current: NaverProductAttribute[],
  keywords: SourcingRelatedKeyword[],
  categoryId: string | null,
  allowedValues?: Array<{
    attributeSeq: number;
    attributeValueSeq: number;
  }>,
) {
  if (!categoryId) return current;
  const merged = [...current];
  for (const keyword of keywords) {
    const match = keyword.officialAttribute;
    if (
      keyword.placement !== "attribute" ||
      !match ||
      match.categoryId !== categoryId ||
      merged.some((item) => item.attributeSeq === match.attributeSeq) ||
      (allowedValues &&
        !allowedValues.some(
          (value) =>
            value.attributeSeq === match.attributeSeq &&
            value.attributeValueSeq === match.attributeValueSeq,
        ))
    ) {
      continue;
    }
    merged.push({
      attributeSeq: match.attributeSeq,
      attributeValueSeq: match.attributeValueSeq,
      minValue: "",
      maxValue: "",
      unitCode: null,
    });
  }
  return merged;
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ko-KR");
}
