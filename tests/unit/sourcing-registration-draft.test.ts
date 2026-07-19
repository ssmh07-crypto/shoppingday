import { describe, expect, it } from "vitest";
import {
  buildSourcingRegistrationDraft,
  categoryKeywordsInTitle,
} from "@/modules/sourcing/registration-draft";
import type { SourcingRelatedKeyword } from "@/modules/sourcing/types";

describe("소싱 상품 등록 초안", () => {
  it("검색수 1,000 이하 상품명·태그 키워드만 자동 반영한다", () => {
    const draft = buildSourcingRegistrationDraft("욕실화", [
      keyword("미끄럼방지욕실화", 980, "product_name"),
      keyword("물빠짐욕실화", 420, "product_name"),
      keyword("욕실슬리퍼", 700, "tag"),
      keyword("대형욕실화", 1_001, "product_name"),
    ]);

    expect(draft.title).toBe("미끄럼방지 물빠짐 욕실화");
    expect(draft.title).not.toContain("대형");
    expect(draft.searchTags).toEqual(["욕실슬리퍼"]);
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
