import { describe, expect, it } from "vitest";
import {
  buildSourcingRegistrationDraft,
  categoryKeywordsInTitle,
} from "@/modules/sourcing/registration-draft";
import type { SourcingRelatedKeyword } from "@/modules/sourcing/types";

describe("소싱 상품 등록 초안", () => {
  it("상품명은 검색수 1,000 이하만 쓰고 태그는 검색수와 관계없이 추출한다", () => {
    const draft = buildSourcingRegistrationDraft("욕실화", [
      keyword("미끄럼방지욕실화", 980, "product_name"),
      keyword("물빠짐욕실화", 420, "product_name"),
      keyword("욕실슬리퍼", 700, "tag"),
      keyword("화장실슬리퍼", 12_000, "tag"),
      keyword("대형욕실화", 1_001, "product_name"),
    ]);

    expect(draft.title).toBe("미끄럼방지 물빠짐 욕실화");
    expect(draft.title).not.toContain("대형");
    expect(draft.tagCandidates).toEqual(["화장실슬리퍼", "욕실슬리퍼"]);
    expect(draft.searchTags).toEqual(["화장실슬리퍼", "욕실슬리퍼"]);
  });

  it("카테고리 키워드를 상품명 재료로 사용하지 않는다", () => {
    const draft = buildSourcingRegistrationDraft("도시락통", [
      keyword("스텐도시락통", 800, "product_name"),
      keyword("밀폐", 500, "category"),
    ]);

    expect(draft.title).toBe("스텐 도시락통");
    expect(draft.title).not.toContain("밀폐");
    expect(draft.categoryKeywords).toEqual(["밀폐"]);
  });

  it("사용자가 편집한 상품명에 독립된 카테고리 키워드가 들어가면 찾는다", () => {
    expect(categoryKeywordsInTitle("밀폐 스텐 도시락통", ["밀폐", "도시락"])).toEqual([
      "밀폐",
    ]);
    expect(categoryKeywordsInTitle("스텐 도시락통", ["밀폐"])).toEqual([]);
  });

  it("홍보어와 기본 상품 유형에 연결되지 않은 키워드는 상품명에서 제외한다", () => {
    const draft = buildSourcingRegistrationDraft("욕실화", [
      keyword("무료배송미끄럼방지욕실화", 900, "product_name"),
      keyword("인기주방정리", 700, "product_name"),
    ]);

    expect(draft.title).toBe("미끄럼방지 욕실화");
    expect(draft.title).not.toMatch(/무료배송|인기|주방정리/);
    expect(draft.warnings.join(" ")).toContain("홍보성 표현");
    expect(draft.warnings.join(" ")).toContain("기본 상품 유형과 연결되지 않은");
  });

  it("사용자가 고른 상품명 검색어의 수식어를 먼저 배치한다", () => {
    const keywords = [
      keyword("물빠짐욕실화", 900, "product_name"),
      keyword("미끄럼방지욕실화", 400, "product_name"),
    ];

    expect(buildSourcingRegistrationDraft("욕실화", keywords).title).toBe(
      "미끄럼방지 물빠짐 욕실화",
    );
    expect(
      buildSourcingRegistrationDraft("욕실화", keywords, {
        preferredTitleKeyword: "물빠짐욕실화",
      }).title,
    ).toBe("물빠짐 미끄럼방지 욕실화");
  });

  it("관련 후보 전체를 검토하고 최종 상품명은 50자를 넘기지 않는다", () => {
    const draft = buildSourcingRegistrationDraft("욕실화", [
      keyword(
        "미끄럼방지기능성초경량빠른건조편안한착화감논슬립바닥패턴욕실화",
        900,
        "product_name",
      ),
      keyword("빠른물빠짐구조욕실화", 800, "product_name"),
      keyword("폭신한쿠션착화감욕실화", 700, "product_name"),
      keyword("가벼운욕실전용욕실화", 600, "product_name"),
      keyword("논슬립바닥패턴욕실화", 500, "product_name"),
      keyword("여섯번째후보욕실화", 400, "product_name"),
    ]);

    expect(draft.title.length).toBeLessThanOrEqual(50);
    expect(draft.title).toMatch(/욕실화$/);
    expect(draft.titleCandidates).toHaveLength(6);
    expect(draft.warnings.join(" ")).toContain("50자");
  });

  it("같은 의미군에서는 검색량이 높은 관련 후보를 우선한다", () => {
    const draft = buildSourcingRegistrationDraft("욕실화", [
      keyword("낮은욕실화", 950, "product_name"),
      keyword("발등낮은욕실화", 900, "product_name"),
      keyword("앞막힌 욕실화", 850, "product_name"),
      keyword("문에안걸리는 욕실화", 700, "product_name"),
    ]);

    expect(draft.title).toBe("낮은 앞막힌 욕실화");
    expect(draft.usedTitleKeywords).toEqual([
      "낮은욕실화",
      "앞막힌 욕실화",
    ]);
    expect(draft.warnings.join(" ")).toContain(
      "발등낮은욕실화, 문에안걸리는 욕실화",
    );
  });

  it("기본 상품 유형과 연결되지 않은 후보는 조합에서 제외한다", () => {
    const draft = buildSourcingRegistrationDraft("욕실화", [
      keyword("문에안걸리는슬리퍼", 990, "product_name"),
      keyword("낮은욕실화", 950, "product_name"),
      keyword("화장실미끄럼방지슬리퍼", 940, "product_name"),
      keyword("물빠짐욕실화", 930, "product_name"),
      keyword("빠른건조욕실화", 920, "product_name"),
      keyword("푹신한욕실화", 910, "product_name"),
      keyword("빅사이즈욕실화", 900, "product_name"),
    ]);

    expect(draft.title).toContain("낮은");
    expect(draft.title).toContain("미끄럼방지");
    expect(draft.title).toContain("빅사이즈");
    expect(draft.warnings.join(" ")).toContain("문에안걸리는슬리퍼");
    expect(draft.usedTitleKeywords).not.toContain("문에안걸리는슬리퍼");
  });

  it("50자를 넘지 않는 조합 중 우선 키워드를 유지하며 가장 긴 제목을 고른다", () => {
    const draft = buildSourcingRegistrationDraft("욕실화", [
      keyword("낮은높이문에잘걸리지않는욕실화", 990, "product_name"),
      keyword("미끄럼방지논슬립바닥패턴욕실화", 980, "product_name"),
      keyword("빠른물빠짐배수구조욕실화", 970, "product_name"),
      keyword("빠른건조속건구조욕실화", 960, "product_name"),
      keyword("푹신한쿠션착화감욕실화", 950, "product_name"),
    ]);

    expect(draft.title.length).toBeLessThanOrEqual(50);
    expect(draft.title.length).toBeGreaterThanOrEqual(45);
    expect(draft.title).toContain("낮은 높이");
    expect(draft.title).toMatch(/욕실화$/);
  });

  it("동의 상품형을 명사 기준점으로 나눠 사람이 읽기 쉽게 배치한다", () => {
    const draft = buildSourcingRegistrationDraft("욕실화", [
      keyword("낮은욕실화", 950, "product_name"),
      keyword("앞막힌욕실화", 900, "product_name"),
      keyword("예쁜욕실화", 850, "product_name"),
      keyword("안미끄러운욕실슬리퍼", 800, "product_name"),
      keyword("국산욕실슬리퍼", 700, "product_name"),
    ]);

    expect(draft.title).toBe(
      "낮은 욕실화 안 미끄러운 앞막힌 예쁜 국산 욕실슬리퍼",
    );
    expect(draft.usedTitleKeywords).toEqual([
      "낮은욕실화",
      "안미끄러운욕실슬리퍼",
      "앞막힌욕실화",
      "예쁜욕실화",
      "국산욕실슬리퍼",
    ]);
    expect(draft.title.length).toBeLessThanOrEqual(50);
  });

  it("후보가 많아도 두 명사 기준점 사이의 서로 다른 특징을 누락하지 않는다", () => {
    const draft = buildSourcingRegistrationDraft("욕실화", [
      keyword("낮은 욕실화", 790, "product_name"),
      keyword("앞막힌 욕실화", 340, "product_name"),
      keyword("안미끄러운욕실화", 170, "product_name"),
      keyword("예쁜 욕실화", 100, "product_name"),
      keyword("국산욕실슬리퍼", 90, "product_name"),
      keyword("욕실화 280", 80, "product_name"),
      keyword("EVA욕실슬리퍼", 70, "product_name"),
      keyword("빅사이즈욕실화", 60, "product_name"),
      keyword("푹신한욕실화", 40, "product_name"),
      keyword("항균 욕실화", 40, "product_name"),
      keyword("물때안끼는욕실화", 30, "product_name"),
    ]);

    expect(draft.title).toBe(
      "낮은 욕실화 안 미끄러운 푹신한 280 욕실화 앞막힌 EVA 물때 안 끼는 국산 욕실슬리퍼",
    );
    expect(draft.title).toMatch(/^낮은 욕실화 /);
    expect(draft.title).toMatch(/국산 욕실슬리퍼$/);
    expect(draft.title).toContain("앞막힌");
    expect(draft.title).toContain("안 미끄러운");
    expect(draft.title.length).toBeGreaterThanOrEqual(40);
    expect(draft.title.length).toBeLessThanOrEqual(50);
    expect(draft.title.match(/욕실화/g)).toHaveLength(2);
    expect(draft.usedTitleKeywords.length).toBeGreaterThan(2);
  });
});

function keyword(
  value: string,
  monthlySearchVolume: number,
  placement: SourcingRelatedKeyword["placement"],
): SourcingRelatedKeyword {
  return {
    id: crypto.randomUUID(),
    keyword: value,
    normalizedKeyword: value.replace(/\s+/g, ""),
    monthlySearchVolume,
    placement,
    source: "itemscout-xlsx",
    importedAt: "2026-07-19T00:00:00.000Z",
  };
}
