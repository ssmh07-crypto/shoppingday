import { describe, expect, it } from "vitest";
import {
  mergeImportedKeywords,
  parseItemScoutRows,
  parseManualRelatedKeywords,
} from "@/modules/sourcing/itemscout-import";

describe("아이템스카우트 엑셀 가져오기", () => {
  it("키워드와 총 검색수만 읽고 공백 중복은 하나로 합친다", () => {
    let id = 0;
    const result = parseItemScoutRows(
      [
        ["상세정보 확인", "키워드", "PC 검색", "모바일 검색", "총 검색수", "경쟁강도"],
        ["https://example.com/1", "욕실화", 2020, 10800, 12820, 37.32],
        ["https://example.com/2", "미끄럼방지 욕실화", 210, 1200, 1410, 105.78],
        ["https://example.com/3", "미끄럼방지욕실화", 200, 1100, 1300, 99],
      ],
      new Date("2026-07-19T00:00:00.000Z"),
      () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    );

    expect(result.sourceRowCount).toBe(3);
    expect(result.duplicateCount).toBe(1);
    expect(result.keywords).toHaveLength(2);
    expect(result.keywords[0]).toMatchObject({
      keyword: "욕실화",
      monthlySearchVolume: 12820,
      placement: "unclassified",
      source: "itemscout-xlsx",
    });
    expect(result.keywords[1]?.monthlySearchVolume).toBe(1410);
  });

  it("총 검색수 열이 없으면 PC와 모바일 검색수를 합산한다", () => {
    const result = parseItemScoutRows(
      [
        ["키워드", "PC 검색", "모바일 검색"],
        ["욕실 슬리퍼", "1,320", "7,260"],
      ],
      new Date("2026-07-19T00:00:00.000Z"),
      () => "00000000-0000-4000-8000-000000000001",
    );

    expect(result.keywords[0]?.monthlySearchVolume).toBe(8580);
  });

  it("같은 키워드를 다시 가져오면 사용자가 지정한 분류를 유지한다", () => {
    const previous = parseItemScoutRows(
      [["키워드", "총 검색수"], ["욕실화", 12000]],
      new Date("2026-07-18T00:00:00.000Z"),
      () => "00000000-0000-4000-8000-000000000001",
    ).keywords.map((item) => ({ ...item, placement: "product_name" as const }));
    const next = parseItemScoutRows(
      [["키워드", "총 검색수"], ["욕실화", 12820]],
      new Date("2026-07-19T00:00:00.000Z"),
      () => "00000000-0000-4000-8000-000000000002",
    ).keywords;

    expect(mergeImportedKeywords(previous, next)[0]).toMatchObject({
      monthlySearchVolume: 12820,
      placement: "product_name",
    });
  });

  it("다른 엑셀을 추가로 가져와도 기존 키워드를 보존한다", () => {
    const previous = parseItemScoutRows(
      [["키워드", "총 검색수"], ["욕실화", 12000]],
      new Date("2026-07-18T00:00:00.000Z"),
      () => "00000000-0000-4000-8000-000000000001",
    ).keywords.map((item) => ({ ...item, placement: "product_name" as const }));
    const next = parseItemScoutRows(
      [["키워드", "총 검색수"], ["물빠짐 욕실화", 420]],
      new Date("2026-07-19T00:00:00.000Z"),
      () => "00000000-0000-4000-8000-000000000002",
    ).keywords;

    expect(mergeImportedKeywords(previous, next)).toEqual([
      expect.objectContaining({ keyword: "욕실화", placement: "product_name" }),
      expect.objectContaining({ keyword: "물빠짐 욕실화", placement: "unclassified" }),
    ]);
  });

  it("직접 입력한 키워드와 선택적인 검색수를 읽어 누적할 수 있다", () => {
    let id = 0;
    const parsed = parseManualRelatedKeywords(
      "욕실 미끄럼방지\n물빠짐 욕실화, 1,200\n욕실 미끄럼방지",
      new Date("2026-07-20T00:00:00.000Z"),
      () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    );

    expect(parsed.sourceRowCount).toBe(3);
    expect(parsed.duplicateCount).toBe(1);
    expect(parsed.keywords).toEqual([
      expect.objectContaining({
        keyword: "물빠짐 욕실화",
        monthlySearchVolume: 1200,
        source: "manual",
      }),
      expect.objectContaining({
        keyword: "욕실 미끄럼방지",
        monthlySearchVolume: null,
        source: "manual",
      }),
    ]);
  });
});
