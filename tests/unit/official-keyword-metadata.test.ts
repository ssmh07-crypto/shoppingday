import { describe, expect, it } from "vitest";
import {
  matchOfficialAttributeKeyword,
  mergeOfficialKeywordAttributes,
} from "@/modules/sourcing/official-keyword-metadata";
import type { SourcingRelatedKeyword } from "@/modules/sourcing/types";

describe("소싱 키워드 공식 메타데이터", () => {
  const context = {
    category: {
      id: "50000001",
      name: "야채탈수기",
      wholeCategoryName: "생활/건강 > 주방용품 > 야채탈수기",
    },
    attributes: [
      { attributeSeq: 10, attributeName: "타입" },
      { attributeSeq: 20, attributeName: "재질" },
    ],
    attributeValues: [
      { attributeSeq: 10, attributeValueSeq: 101, attributeValueName: "스피너" },
      { attributeSeq: 20, attributeValueSeq: 201, attributeValueName: "스테인리스" },
    ],
  };

  it("키워드를 예상 카테고리의 공식 속성명과 속성값에 연결한다", () => {
    expect(matchOfficialAttributeKeyword("야채 스피너", context)).toEqual({
      categoryId: "50000001",
      categoryName: "생활/건강 > 주방용품 > 야채탈수기",
      attributeSeq: 10,
      attributeName: "타입",
      attributeValueSeq: 101,
      attributeValueName: "스피너",
    });
  });

  it("최종 카테고리가 같을 때만 빈 공식 속성에 자동 입력한다", () => {
    const keyword = {
      id: crypto.randomUUID(),
      keyword: "스피너",
      normalizedKeyword: "스피너",
      monthlySearchVolume: 300,
      placement: "attribute",
      source: "manual",
      importedAt: "2026-08-16T00:00:00.000Z",
      officialAttribute: matchOfficialAttributeKeyword("스피너", context),
    } satisfies SourcingRelatedKeyword;

    expect(
      mergeOfficialKeywordAttributes([], [keyword], "50000001"),
    ).toEqual([
      {
        attributeSeq: 10,
        attributeValueSeq: 101,
        minValue: "",
        maxValue: "",
        unitCode: null,
      },
    ]);
    expect(
      mergeOfficialKeywordAttributes([], [keyword], "50000002"),
    ).toEqual([]);
    expect(
      mergeOfficialKeywordAttributes(
        [{
          attributeSeq: 10,
          attributeValueSeq: 999,
          minValue: "",
          maxValue: "",
          unitCode: null,
        }],
        [keyword],
        "50000001",
      ),
    ).toHaveLength(1);
  });
});
