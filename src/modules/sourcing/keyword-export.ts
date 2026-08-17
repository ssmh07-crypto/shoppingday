import type { Cell, SheetData } from "write-excel-file/browser";
import type {
  SourcingRelatedKeyword,
  SourcingResearchInput,
} from "./types";

const placementLabels = {
  unclassified: "미분류",
  product_name: "상품명 키워드",
  tag: "태그 키워드",
  attribute: "속성 키워드",
  category: "카테고리 키워드",
} as const;

const headerStyle = {
  fontWeight: "bold" as const,
  textColor: "#FFFFFF",
  backgroundColor: "#1D4ED8",
  align: "center" as const,
  alignVertical: "center" as const,
  wrap: true,
  height: 34,
  bottomBorderColor: "#93C5FD",
  bottomBorderStyle: "thin" as const,
};

export function buildSourcingKeywordWorkbook(input: SourcingResearchInput) {
  const keywords = [...input.relatedKeywords].sort((left, right) =>
    placementOrder(left) - placementOrder(right) ||
    (right.monthlySearchVolume ?? -1) - (left.monthlySearchVolume ?? -1) ||
    left.keyword.localeCompare(right.keyword, "ko-KR"),
  );
  const analyzedCount = keywords.filter((item) => item.analysis).length;
  const titleCount = keywords.filter(
    (item) => item.placement === "product_name",
  ).length;
  const tagCount = keywords.filter((item) => item.placement === "tag").length;

  return [
    {
      sheet: "키워드 분류",
      data: buildKeywordSheet(
        input,
        keywords,
        analyzedCount,
        titleCount,
        tagCount,
      ),
      columns: keywordColumnWidths.map((width) => ({ width })),
      stickyRowsCount: 5,
      stickyColumnsCount: 2,
      showGridLines: false,
    },
    {
      sheet: "판독 표본",
      data: buildSampleSheet(keywords),
      columns: sampleColumnWidths.map((width) => ({ width })),
      stickyRowsCount: 2,
      stickyColumnsCount: 2,
      showGridLines: false,
    },
  ];
}

export async function downloadSourcingKeywordWorkbook(
  input: SourcingResearchInput,
) {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const safeKeyword = (input.sourcingKeyword.trim() || "소싱키워드")
    .replace(/[\\/:*?"<>|]/g, "_")
    .slice(0, 60);
  await writeXlsxFile(buildSourcingKeywordWorkbook(input)).toFile(
    `${safeKeyword}_키워드분류.xlsx`,
  );
}

function buildKeywordSheet(
  input: SourcingResearchInput,
  keywords: SourcingRelatedKeyword[],
  analyzedCount: number,
  titleCount: number,
  tagCount: number,
): SheetData {
  const columnCount = keywordHeaders.length;
  return [
    [
      {
        value: `${input.sourcingKeyword || "소싱"} 키워드 분류`,
        columnSpan: columnCount,
        fontSize: 16,
        fontWeight: "bold",
        textColor: "#FFFFFF",
        backgroundColor: "#0F172A",
        alignVertical: "center",
        height: 30,
      },
      ...Array<Cell>(columnCount - 1).fill(null),
    ],
    metadataRow(
      "판매 카테고리",
      input.naverCategory?.wholeCategoryName ?? "미선택",
      columnCount,
    ),
    metadataRow(
      "분류 요약",
      `전체 ${keywords.length}개 · 상세 분석 ${analyzedCount}개 · 상품명 ${titleCount}개 · 태그 ${tagCount}개`,
      columnCount,
    ),
    metadataRow(
      "활용 안내",
      "상품명·태그 수정 전 실제 판매 상품과의 관련성을 다시 확인하세요. 검색 결과 표본은 관측 사실이며 노출을 보장하지 않습니다.",
      columnCount,
    ),
    keywordHeaders.map((value) => ({ value, ...headerStyle })),
    ...keywords.map(keywordRow),
  ];
}

function keywordRow(item: SourcingRelatedKeyword): Cell[] {
  const analysis = item.analysis;
  const exposure = analysis?.exposure;
  const productCount = exposure?.productCount ?? 0;
  const leadingOtherCategory = exposure?.categoryDistribution
    .filter((entry) => entry.category !== exposure.contextCategoryName)
    .sort((left, right) => right.count - left.count)[0];
  const officialAttribute = item.officialAttribute;
  const officialTag = item.officialTag ?? analysis?.tagDictionary.exactTag;
  const titleRate = productCount ? (exposure?.titleMatchCount ?? 0) / productCount : null;
  const categoryFitRate = productCount
    ? (exposure?.contextCategoryMatchCount ?? 0) / productCount
    : null;
  const bodyStyle = {
    alignVertical: "top" as const,
    wrap: true,
    bottomBorderColor: "#E2E8F0",
    bottomBorderStyle: "thin" as const,
  };

  return [
    { value: item.keyword, fontWeight: "bold", ...bodyStyle },
    numberCell(item.monthlySearchVolume, bodyStyle),
    { value: placementLabels[item.placement], ...bodyStyle },
    { value: item.placement === "product_name" ? "Y" : "", align: "center", ...bodyStyle },
    {
      value:
        officialTag &&
        (item.placement === "tag" || item.placement === "product_name")
          ? officialTag.text
          : "",
      ...bodyStyle,
    },
    numberCell(exposure?.titleMatchCount, bodyStyle),
    percentCell(titleRate, bodyStyle),
    numberCell(exposure?.contextCategoryMatchCount, bodyStyle),
    percentCell(categoryFitRate, bodyStyle),
    numberCell(exposure?.attributeMatchCount, bodyStyle),
    numberCell(exposure?.categoryMatchCount, bodyStyle),
    { value: leadingOtherCategory?.category ?? "", ...bodyStyle },
    numberCell(leadingOtherCategory?.count, bodyStyle),
    { value: officialTag?.text ?? "", ...bodyStyle },
    numberCell(officialTag?.code, bodyStyle),
    { value: officialAttribute?.attributeName ?? "", ...bodyStyle },
    { value: officialAttribute?.attributeValueName ?? "", ...bodyStyle },
    {
      value: analysis
        ? placementLabels[analysis.recommendedPlacement]
        : "",
      ...bodyStyle,
    },
    { value: analysis?.recommendationReason ?? "", ...bodyStyle },
    {
      value: analysis?.requiresReview ? "삭제 검토" : "",
      textColor: analysis?.requiresReview ? "#B91C1C" : undefined,
      fontWeight: analysis?.requiresReview ? "bold" : undefined,
      ...bodyStyle,
    },
    {
      ...dateCell(exposure?.observedAt, bodyStyle),
    },
  ];
}

function buildSampleSheet(keywords: SourcingRelatedKeyword[]): SheetData {
  const rows: SheetData = [
    [
      {
        value: "네이버쇼핑 1페이지 상품명 판독 표본",
        columnSpan: sampleHeaders.length,
        fontSize: 15,
        fontWeight: "bold",
        textColor: "#FFFFFF",
        backgroundColor: "#0F172A",
        height: 28,
      },
      ...Array<Cell>(sampleHeaders.length - 1).fill(null),
    ],
    sampleHeaders.map((value) => ({ value, ...headerStyle })),
  ];
  for (const item of keywords) {
    for (const sample of item.analysis?.exposure.samples ?? []) {
      rows.push([
        item.keyword,
        sample.title,
        sample.matchedIn.map(matchedInLabel).join(", "),
        sample.category ?? "",
        sample.contextCategoryMatched == null
          ? ""
          : sample.contextCategoryMatched
            ? "일치"
            : "불일치",
        sample.evidence,
        new Date(item.analysis!.exposure.observedAt),
      ].map((value, index) => ({
        value,
        type: index === 6 ? Date : undefined,
        format: index === 6 ? "yyyy-mm-dd hh:mm" : undefined,
        alignVertical: "top" as const,
        wrap: true,
        bottomBorderColor: "#E2E8F0",
        bottomBorderStyle: "thin" as const,
      })));
    }
  }
  if (rows.length === 2) {
    rows.push([
      {
        value: "저장된 판독 표본이 없습니다.",
        columnSpan: sampleHeaders.length,
        textColor: "#64748B",
      },
      ...Array<Cell>(sampleHeaders.length - 1).fill(null),
    ]);
  }
  return rows;
}

function metadataRow(label: string, value: string, columnCount: number): Cell[] {
  return [
    {
      value: label,
      fontWeight: "bold",
      backgroundColor: "#DBEAFE",
      alignVertical: "center",
    },
    {
      value,
      columnSpan: columnCount - 1,
      wrap: true,
      alignVertical: "center",
    },
    ...Array<Cell>(columnCount - 2).fill(null),
  ];
}

function numberCell(
  value: number | null | undefined,
  style: Record<string, unknown>,
) {
  if (value == null) return { value: "", ...style };
  return {
    value,
    type: Number,
    format: "#,##0",
    align: "right" as const,
    ...style,
  };
}

function percentCell(
  value: number | null,
  style: Record<string, unknown>,
) {
  if (value == null) return { value: "", ...style };
  return {
    value,
    type: Number,
    format: "0.0%",
    align: "right" as const,
    ...style,
  };
}

function dateCell(
  value: string | null | undefined,
  style: Record<string, unknown>,
) {
  if (!value) return { value: "", ...style };
  return {
    value: new Date(value),
    type: Date,
    format: "yyyy-mm-dd hh:mm",
    ...style,
  };
}

function placementOrder(item: SourcingRelatedKeyword) {
  return {
    product_name: 0,
    tag: 1,
    attribute: 2,
    category: 3,
    unclassified: 4,
  }[item.placement];
}

function matchedInLabel(value: "product_name" | "attribute" | "category") {
  return {
    product_name: "상품명",
    attribute: "카드 부가정보",
    category: "카테고리",
  }[value];
}

const keywordHeaders = [
  "키워드",
  "월 검색수",
  "현재 분류",
  "상품명 후보",
  "태그 후보",
  "상품명 노출 건수",
  "상품명 노출률",
  "선택 카테고리 적합 건수",
  "선택 카테고리 적합률",
  "카드 부가정보 건수",
  "카테고리 노출 건수",
  "주요 다른 카테고리",
  "다른 카테고리 건수",
  "공식 태그",
  "공식 태그 코드",
  "공식 속성명",
  "공식 속성값",
  "자동 추천 분류",
  "자동 추천 근거",
  "확인 필요",
  "분석 시각",
];

const keywordColumnWidths = [
  22, 13, 17, 13, 22, 15, 15, 19, 19, 18, 18, 28, 18, 20, 16, 20, 22, 18, 55, 15, 20,
];

const sampleHeaders = [
  "키워드",
  "판독 상품명",
  "키워드 확인 위치",
  "상품 카테고리",
  "선택 카테고리 적합",
  "판독 근거",
  "관측 시각",
];

const sampleColumnWidths = [22, 55, 24, 30, 20, 55, 20];
