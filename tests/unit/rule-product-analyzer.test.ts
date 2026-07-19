import { describe, expect, it } from "vitest";
import { analyzeProductByRules } from "@/modules/keywords/rule-product-analyzer";
import { createRuleKeywordCandidates } from "@/modules/keywords/rules-keyword-client";

const baseInput = {
  supplierTitle: "",
  currentTitle: "",
  description: "",
  category: "",
  features: [],
  materials: [],
  colors: [],
  sizes: [],
  target: "",
  seasons: [],
  supplierUrl: "",
  imageUrls: [],
  memo: "",
};

describe("규칙 기반 상품 분석", () => {
  it("상품명에서 확인된 정보만 분류하고 나머지는 미분류로 보존한다", () => {
    const analysis = analyzeProductByRules({
      ...baseInput,
      supplierTitle: "철제 바느질 골무 바느질부자재 특수형",
    });

    expect(analysis).toMatchObject({
      primaryProductType: null,
      productTypeStatus: "review_required",
      materials: ["철제"],
      purposes: ["바느질"],
      categoryTerms: ["바느질부자재"],
    });
    expect(analysis.productTypes).toEqual(expect.arrayContaining(["골무", "특수형"]));
  });

  it("추상적인 표현만 있으면 상품 유형을 임의로 확정하지 않는다", () => {
    const analysis = analyzeProductByRules({
      ...baseInput,
      supplierTitle: "여성 봄 신상 예쁜 데일리룩",
    });

    expect(analysis.primaryProductType).toBeNull();
    expect(analysis.productTypeStatus).toBe("review_required");
  });

  it("사용자 확인 전에는 후보를 생성하지 않고 확인된 속성만 조합한다", () => {
    const analysis = analyzeProductByRules({
      ...baseInput,
      supplierTitle: "철제 바느질 골무 바느질부자재",
    });
    expect(createRuleKeywordCandidates(analysis, 30)).toEqual([]);

    const candidates = createRuleKeywordCandidates({
      ...analysis,
      productTypeStatus: "user_confirmed",
    }, 30);
    expect(candidates.map((item) => item.keyword)).toEqual(
      expect.arrayContaining(["골무", "철제 골무", "바느질 골무"]),
    );
    expect(candidates.some((item) => /골무\s+골무/.test(item.keyword))).toBe(false);
  });
});
