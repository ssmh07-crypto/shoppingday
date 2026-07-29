import { describe, expect, it } from "vitest";
import {
  createRulesAnalysis,
  createRuleKeywordCandidates,
  createRulesTitle,
} from "@/modules/keywords/rules-keyword-client";

const product = {
  supplierTitle: "여성 여름 린넨 혼방 루즈핏 원피스 무료배송",
  description: "여름용 원피스",
  category: "패션의류 > 여성의류 > 원피스",
  features: ["루즈핏"],
  materials: ["린넨 혼방"],
  colors: ["베이지"],
  sizes: ["FREE"],
  target: "여성",
  seasons: ["여름"],
  supplierUrl: "",
  imageUrls: [],
  memo: "",
};

describe("규칙 기반 키워드 생성", () => {
  it("분석 단계에서는 키워드를 만들지 않고 사용자 확인 뒤 후보를 만든다", () => {
    const result = createRulesAnalysis(product, 30);
    expect(result).toMatchObject({
      source: "rules",
      model: "rules-keyword-analysis-v1",
      productAnalysis: { productType: "원피스" },
    });
    expect(result.keywordCandidates).toEqual([]);
    const candidates = createRuleKeywordCandidates({
      ...result.productAnalysis,
      productTypeStatus: "user_confirmed",
    }, 30);
    expect(candidates.length).toBeLessThanOrEqual(15);
    expect(candidates.map((item) => item.keyword)).toEqual(
      expect.arrayContaining(["원피스", "여성 원피스", "린넨 혼방 원피스"]),
    );
    expect(candidates.some((item) => item.keyword.includes("무료배송"))).toBe(false);
  });

  it("선택 키워드의 중복 단어와 금지어를 제거해 상품 유형을 뒤에 둔다", () => {
    expect(
      createRulesTitle({
        productInput: product,
        analysis: createRulesAnalysis(product, 30).productAnalysis,
        selectedKeywords: ["여성 원피스", "여름 원피스", "린넨 원피스"],
        maximumLength: 60,
        bannedWords: ["여성"],
      }),
    ).toBe("여름 린넨 원피스");
  });

  it("숫자 네이버 카테고리 ID를 상품 유형으로 사용하지 않는다", () => {
    const result = createRulesAnalysis({ ...product, category: "50000805" }, 30);
    expect(result.productAnalysis.productType).toBe("원피스");
  });

  it("일반 분류어보다 상품명의 구체 품목을 상품 유형으로 선택한다", () => {
    const result = createRulesAnalysis({
      ...product,
      supplierTitle: "철제 바느질 골무 바느질부자재",
      category: "",
    }, 30);
    expect(result.productAnalysis.productType).toBe("골무");
    const candidates = createRuleKeywordCandidates({
      ...result.productAnalysis,
      productTypeStatus: "user_confirmed",
    }, 30);
    expect(candidates.map((item) => item.keyword)).toContain("철제 골무");
  });

  it("구체적인 상품 유형이 있으면 중복되는 넓은 분류어를 상품명 초안에서 제외한다", () => {
    const actualProduct = {
      ...product,
      supplierTitle: "철제 바느질 골무 바느질부자재",
      description: "철제 바느질 골무",
      category: "",
      materials: ["철제"],
      features: ["바느질"],
    };
    const analysis = createRulesAnalysis(actualProduct, 30).productAnalysis;

    expect(
      createRulesTitle({
        productInput: actualProduct,
        analysis,
        selectedKeywords: [
          "골무",
          "철제 골무",
          "바느질 골무",
          "철제 바느질 골무 바느질부자재",
          "철제 바느질 골무",
        ],
        maximumLength: 60,
        bannedWords: [],
      }),
    ).toBe("철제 바느질 골무");
  });

  it("부품·소모품 카테고리는 품목을 먼저 읽는 별도 어순 템플릿을 사용한다", () => {
    const analysis = {
      ...createRulesAnalysis(product, 30).productAnalysis,
      productType: "필터",
      productTypes: ["필터"],
      primaryProductType: "필터",
      productTypeStatus: "user_confirmed" as const,
    };
    expect(createRulesTitle({
      productInput: { ...product, category: "생활가전 > 교체용 부품" },
      analysis,
      selectedKeywords: ["헤파 필터", "교체용 필터"],
      maximumLength: 60,
      bannedWords: [],
    })).toBe("필터 헤파 교체용");
  });
});
