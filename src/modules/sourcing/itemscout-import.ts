import type {
  SourcingRelatedKeyword,
} from "./types";

type SpreadsheetCell = string | number | boolean | Date | null | undefined;

export interface ItemScoutImportResult {
  keywords: SourcingRelatedKeyword[];
  sourceRowCount: number;
  duplicateCount: number;
}

export interface ManualKeywordInputResult {
  keywords: SourcingRelatedKeyword[];
  sourceRowCount: number;
  duplicateCount: number;
}

export async function parseItemScoutWorkbook(
  file: File,
): Promise<ItemScoutImportResult> {
  const { default: readXlsxFile } = await import("read-excel-file/browser");
  const sheets = await readXlsxFile(file);
  let lastError: unknown;
  for (const sheet of sheets) {
    try {
      return parseItemScoutRows(
        sheet.data as unknown as SpreadsheetCell[][],
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("아이템스카우트 키워드 시트를 찾지 못했습니다.");
}

export function parseItemScoutRows(
  rows: SpreadsheetCell[][],
  now = new Date(),
  idFactory = () => crypto.randomUUID(),
): ItemScoutImportResult {
  if (rows.length < 2) {
    throw new Error("키워드 데이터가 없는 엑셀 파일입니다.");
  }

  const headers = rows[0]!.map(normalizeHeader);
  const keywordIndex = headers.indexOf("키워드");
  const totalIndex = headers.indexOf("총검색수");
  const pcIndex = headers.indexOf("PC검색");
  const mobileIndex = headers.indexOf("모바일검색");

  if (keywordIndex < 0 || (totalIndex < 0 && (pcIndex < 0 || mobileIndex < 0))) {
    throw new Error(
      "아이템스카우트 엑셀에서 '키워드'와 '총 검색수' 열을 찾지 못했습니다.",
    );
  }

  const importedAt = now.toISOString();
  const unique = new Map<string, SourcingRelatedKeyword>();
  let sourceRowCount = 0;

  for (const row of rows.slice(1)) {
    const keyword = stringValue(row[keywordIndex]);
    if (!keyword) continue;
    sourceRowCount += 1;

    const normalizedKeyword = normalizeRelatedKeyword(keyword);
    if (!normalizedKeyword) continue;
    const monthlySearchVolume =
      totalIndex >= 0
        ? numberValue(row[totalIndex])
        : sumNullable(numberValue(row[pcIndex]), numberValue(row[mobileIndex]));
    const existing = unique.get(normalizedKeyword);

    if (existing) {
      if (
        monthlySearchVolume != null &&
        (existing.monthlySearchVolume == null ||
          monthlySearchVolume > existing.monthlySearchVolume)
      ) {
        existing.monthlySearchVolume = monthlySearchVolume;
      }
      continue;
    }

    unique.set(normalizedKeyword, {
      id: idFactory(),
      keyword,
      normalizedKeyword,
      monthlySearchVolume,
      placement: "unclassified",
      source: "itemscout-xlsx",
      importedAt,
    });
  }

  const keywords = Array.from(unique.values()).sort(
    (left, right) =>
      (right.monthlySearchVolume ?? -1) - (left.monthlySearchVolume ?? -1) ||
      left.keyword.localeCompare(right.keyword, "ko"),
  );

  if (!keywords.length) {
    throw new Error("가져올 수 있는 키워드가 없습니다.");
  }

  return {
    keywords,
    sourceRowCount,
    duplicateCount: sourceRowCount - keywords.length,
  };
}

export function mergeImportedKeywords(
  current: SourcingRelatedKeyword[],
  imported: SourcingRelatedKeyword[],
) {
  const merged = new Map(
    current.map((item) => [item.normalizedKeyword, item]),
  );

  for (const item of imported) {
    const existing = merged.get(item.normalizedKeyword);
    merged.set(item.normalizedKeyword, existing
      ? {
          ...existing,
          keyword: item.keyword,
          monthlySearchVolume:
            item.monthlySearchVolume ?? existing.monthlySearchVolume,
          source: item.source,
          importedAt: item.importedAt,
        }
      : item);
  }

  return Array.from(merged.values()).sort(compareRelatedKeywords);
}

export function parseManualRelatedKeywords(
  value: string,
  now = new Date(),
  idFactory = () => crypto.randomUUID(),
): ManualKeywordInputResult {
  const importedAt = now.toISOString();
  const unique = new Map<string, SourcingRelatedKeyword>();
  let sourceRowCount = 0;

  for (const rawLine of value.split(/\r?\n/)) {
    const line = rawLine.normalize("NFKC").trim();
    if (!line) continue;
    sourceRowCount += 1;

    const match = line.match(/^(.*?)(?:\s*[,	]\s*([\d,]+))?$/);
    const keyword = match?.[1]?.trim() ?? "";
    const normalizedKeyword = normalizeRelatedKeyword(keyword);
    if (!normalizedKeyword) continue;
    const monthlySearchVolume = match?.[2]
      ? numberValue(match[2])
      : null;
    const existing = unique.get(normalizedKeyword);

    if (existing) {
      if (monthlySearchVolume != null) {
        existing.monthlySearchVolume = monthlySearchVolume;
      }
      continue;
    }

    unique.set(normalizedKeyword, {
      id: idFactory(),
      keyword,
      normalizedKeyword,
      monthlySearchVolume,
      placement: "unclassified",
      source: "manual",
      importedAt,
    });
  }

  const keywords = Array.from(unique.values()).sort(compareRelatedKeywords);
  return {
    keywords,
    sourceRowCount,
    duplicateCount: sourceRowCount - keywords.length,
  };
}

export function normalizeRelatedKeyword(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function normalizeHeader(value: SpreadsheetCell) {
  return stringValue(value).replace(/\s+/g, "").toLocaleUpperCase("ko-KR");
}

function stringValue(value: SpreadsheetCell) {
  return typeof value === "string" ? value.normalize("NFKC").trim() : "";
}

function numberValue(value: SpreadsheetCell) {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  }
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : null;
}

function sumNullable(left: number | null, right: number | null) {
  if (left == null && right == null) return null;
  return (left ?? 0) + (right ?? 0);
}

function compareRelatedKeywords(
  left: SourcingRelatedKeyword,
  right: SourcingRelatedKeyword,
) {
  return (
    (right.monthlySearchVolume ?? -1) - (left.monthlySearchVolume ?? -1) ||
    left.keyword.localeCompare(right.keyword, "ko")
  );
}
