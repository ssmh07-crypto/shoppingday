import { analyzeProductByRules } from "./rule-product-analyzer";
import {
  genericProductTypePattern,
  promotionalTitleTerms,
} from "./title-quality";
import { normalizeKeyword, sanitizeKeyword } from "./keyword-utils";

export const productTitleMaterialTerms = [
  "스테인리스",
  "스테인레스",
  "스텐",
  "철제",
  "금속",
  "고무",
  "실리콘",
  "가죽",
  "플라스틱",
  "아크릴",
  "원목",
  "나무",
  "유리",
  "면",
  "린넨",
  "폴리에스터",
] as const;

const productTitleUseTerms = [
  "바느질",
  "재봉",
  "공예",
  "수납",
  "보관",
  "정리",
  "거치",
  "캠핑",
  "주방",
  "욕실",
  "차량",
  "사무",
  "작업",
  "청소",
  "운동",
  "낚시",
] as const;

const productTitleGeneralTerms = new Set([
  "남성",
  "여성",
  "아동",
  "유아",
  "성인",
  "휴대용",
  "미니",
  "대형",
  "소형",
  "다용도",
]);

export type ProductTitleAnalysisCriteria = {
  productType: string;
  materials: string[];
  uses: string[];
  modifiers: string[];
  removedTerms: string[];
};

export type ProductTitleAnalysisInput = {
  title: string;
  originalTitle?: string;
  categoryPath?: string;
};

export function detectProductTitleAnalysis(
  input: ProductTitleAnalysisInput,
): ProductTitleAnalysisCriteria {
  const cleanTitle = sanitizeKeyword(input.title);
  const categoryPath = sanitizeKeyword(input.categoryPath ?? "");
  const analysis = analyzeProductByRules({
    supplierTitle: cleanTitle,
    description: sanitizeKeyword(input.originalTitle ?? ""),
    category: categoryPath,
    features: [],
    materials: [],
    colors: [],
    sizes: [],
    target: "",
    seasons: [],
    supplierUrl: "",
    imageUrls: [],
    memo: "",
  });
  return {
    productType: analysis.productType,
    ...parseProductTitleParts(cleanTitle, analysis.productType),
  };
}

export function normalizeProductTitleAnalysis(
  criteria: ProductTitleAnalysisCriteria,
): ProductTitleAnalysisCriteria {
  return {
    productType: sanitizeKeyword(criteria.productType),
    materials: unique(criteria.materials),
    uses: unique(criteria.uses),
    modifiers: unique(criteria.modifiers),
    removedTerms: unique(criteria.removedTerms),
  };
}

function parseProductTitleParts(title: string, productType: string) {
  const productTypeNormalized = normalizeKeyword(productType);
  const removedTerms: string[] = [];
  const materials: string[] = [];
  const uses: string[] = [];
  const modifiers: string[] = [];

  for (const token of tokenize(title)) {
    const normalized = normalizeKeyword(token);
    if (normalized === productTypeNormalized) continue;
    if (
      promotionalTitleTerms.some((term) =>
        normalized.includes(normalizeKeyword(term)),
      ) ||
      genericProductTypePattern.test(token)
    ) {
      removedTerms.push(token);
      continue;
    }
    const material = productTitleMaterialTerms.find((term) =>
      normalized.includes(normalizeKeyword(term)),
    );
    if (material) {
      materials.push(material);
      continue;
    }
    const use = productTitleUseTerms.find((term) =>
      normalized.includes(normalizeKeyword(term)),
    );
    if (use) {
      uses.push(use);
      continue;
    }
    if (productTitleGeneralTerms.has(normalized) || token.length <= 8) {
      modifiers.push(token);
    }
  }

  return {
    materials: unique(materials),
    uses: unique(uses),
    modifiers: unique(modifiers),
    removedTerms: unique(removedTerms),
  };
}

function tokenize(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[>｜|/,[\](){}]+/g, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .filter((token) => token.length > 1);
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.map(sanitizeKeyword).filter((value) => {
    const normalized = normalizeKeyword(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
