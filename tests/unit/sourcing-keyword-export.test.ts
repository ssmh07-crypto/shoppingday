import { describe, expect, it } from "vitest";
import { buildSourcingKeywordWorkbook } from "@/modules/sourcing/keyword-export";
import {
  defaultSourcingSignals,
  type SourcingResearchInput,
} from "@/modules/sourcing/types";

describe("소싱 키워드 엑셀", () => {
  it("분류와 상세 근거, 판독 표본을 두 시트에 구성한다", () => {
    const workbook = buildSourcingKeywordWorkbook(research());

    expect(workbook.map((sheet) => sheet.sheet)).toEqual([
      "키워드 분류",
      "판독 표본",
    ]);
    const keywordSheet = workbook[0]!.data;
    const headers = keywordSheet[4]!.map(cellValue);
    const row = keywordSheet[5]!;
    expect(cellValue(row[headers.indexOf("키워드")])).toBe("욕실화");
    expect(cellValue(row[headers.indexOf("월 검색수")])).toBe(12820);
    expect(cellValue(row[headers.indexOf("현재 분류")])).toBe("상품명 키워드");
    expect(cellValue(row[headers.indexOf("상품명 노출 건수")])).toBe(24);
    expect(cellValue(row[headers.indexOf("선택 카테고리 적합 건수")])).toBe(38);
    expect(cellValue(row[headers.indexOf("공식 태그")])).toBe("욕실화");
    expect(cellValue(row[headers.indexOf("자동 추천 근거")])).toContain("24/40");

    const sampleSheet = workbook[1]!.data;
    expect(sampleSheet[2]!.map(cellValue)).toContain("물빠짐 욕실화");
    expect(sampleSheet[2]!.map(cellValue)).toContain("상품명");
  });

  it("실제 xlsx 파일로 생성한 뒤 두 시트를 다시 읽을 수 있다", async () => {
    const [{ default: writeXlsxFile }, { default: readXlsxFile }] =
      await Promise.all([
        import("write-excel-file/node"),
        import("read-excel-file/node"),
      ]);
    const buffer = await writeXlsxFile(
      buildSourcingKeywordWorkbook(research()),
    ).toBuffer();
    const sheets = await readXlsxFile(buffer);

    expect(sheets.map((sheet) => sheet.sheet)).toEqual([
      "키워드 분류",
      "판독 표본",
    ]);
    expect(sheets[0]!.data.flat()).toContain("자동 추천 근거");
    expect(sheets[1]!.data.flat()).toContain("물빠짐 욕실화");
  });
});

function cellValue(cell: unknown) {
  return cell && typeof cell === "object" && "value" in cell
    ? (cell as { value?: unknown }).value
    : cell;
}

function research(): SourcingResearchInput {
  return {
    status: "researching",
    sourcingKeyword: "욕실화",
    monthlySearchVolume: 12820,
    sixMonthRevenue: null,
    marketNotes: "",
    naverCategory: {
      id: "50000001",
      name: "욕실화",
      wholeCategoryName: "생활/건강 > 욕실용품 > 욕실화",
    },
    coupangAveragePrice: null,
    naverAveragePrice: null,
    expectedSellingPrice: null,
    signals: defaultSourcingSignals,
    finalSellingPoint: "",
    positiveReviews: "",
    negativeReviews: "",
    customerNeeds: "",
    productSpecs: "",
    primaryTarget: "",
    referenceNotes: "",
    reviewEntries: [],
    relatedKeywords: [{
      id: "00000000-0000-4000-8000-000000000001",
      keyword: "욕실화",
      normalizedKeyword: "욕실화",
      monthlySearchVolume: 12820,
      placement: "product_name",
      source: "itemscout-xlsx",
      importedAt: "2026-08-17T00:00:00.000Z",
      officialTag: { code: 101, text: "욕실화" },
      analysis: {
        exposure: {
          keyword: "욕실화",
          device: "pc",
          status: "completed",
          productCount: 40,
          titleMatchCount: 24,
          attributeMatchCount: 3,
          categoryMatchCount: 1,
          contextKeyword: "욕실화",
          contextMatchCount: 40,
          contextCategoryId: "50000001",
          contextCategoryName: "욕실화",
          contextCategoryMatchCount: 38,
          categoryDistribution: [
            { category: "생활/건강 > 욕실용품 > 욕실화", count: 38 },
            { category: "패션잡화 > 슬리퍼", count: 2 },
          ],
          observedAt: "2026-08-17T01:00:00.000Z",
          samples: [{
            title: "물빠짐 욕실화",
            matchedIn: ["product_name"],
            evidence: "물빠짐 욕실화",
            category: "생활/건강 > 욕실용품 > 욕실화",
            contextCategoryMatched: true,
          }],
          message: null,
        },
        tagDictionary: {
          keyword: "욕실화",
          status: "registered",
          exactTag: { code: 101, text: "욕실화" },
          candidates: [],
          message: null,
        },
        officialAttributeStatus: "unmatched",
        recommendedPlacement: "product_name",
        recommendationReason: "상품명 24/40건으로 설정한 60% 기준을 충족했습니다.",
        requiresReview: false,
        titleExposureThresholdPercent: 60,
        analyzedAt: "2026-08-17T01:00:00.000Z",
      },
    }],
    samples: [],
  };
}
