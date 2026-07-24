import { keywordLimits, keywordThresholds } from "./config";
import type {
  GeneratedKeywordCandidate,
  KeywordMetrics,
  KeywordSize,
  KeywordThresholds,
} from "./types";

const lessThanPattern = /^<\s*(\d+)$/;

export function normalizeKeyword(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("ko-KR");
}

export function sanitizeKeyword(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

export function deduplicateKeywordCandidates(
  candidates: GeneratedKeywordCandidate[],
  limit: number = keywordLimits.maximumCandidates,
) {
  const seen = new Set<string>();
  const result: GeneratedKeywordCandidate[] = [];
  for (const candidate of candidates) {
    const keyword = sanitizeKeyword(candidate.keyword);
    const normalized = normalizeKeyword(keyword);
    if (
      !normalized ||
      seen.has(normalized) ||
      keyword.length > keywordLimits.maximumKeywordLength ||
      /[.!?。！？]\s*$/.test(keyword)
    ) {
      continue;
    }
    seen.add(normalized);
    result.push({
      keyword,
      reason: candidate.reason.trim().slice(0, 300),
      sourceConcepts: Array.from(
        new Set(candidate.sourceConcepts.map(sanitizeKeyword).filter(Boolean)),
      ).slice(0, 10),
    });
    if (result.length >= limit) break;
  }
  return result;
}

export function normalizeSearchVolume(value: string | number | null | undefined) {
  if (value == null || value === "") {
    return { raw: null, normalized: null, upperBound: null, isRange: false };
  }
  if (typeof value === "number") {
    const normalized = Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : null;
    return { raw: value, normalized, upperBound: normalized, isRange: false };
  }
  const compact = value.trim().replace(/,/g, "");
  const range = lessThanPattern.exec(compact);
  if (range) {
    const exclusiveUpperBound = Number(range[1]);
    return {
      raw: value.trim(),
      normalized: Math.max(0, exclusiveUpperBound - 1),
      upperBound: exclusiveUpperBound,
      isRange: true,
    };
  }
  const parsed = Number(compact);
  const normalized = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null;
  return { raw: value.trim(), normalized, upperBound: normalized, isRange: false };
}

export function sumSearchVolumes(
  pc: ReturnType<typeof normalizeSearchVolume>,
  mobile: ReturnType<typeof normalizeSearchVolume>,
) {
  if (pc.normalized == null || mobile.normalized == null) return null;
  return pc.normalized + mobile.normalized;
}

export function formatRawTotalSearchVolume(metrics: Pick<
  KeywordMetrics,
  | "rawMonthlyPcSearchVolume"
  | "rawMonthlyMobileSearchVolume"
  | "totalMonthlySearchVolume"
>) {
  const pc = normalizeSearchVolume(metrics.rawMonthlyPcSearchVolume);
  const mobile = normalizeSearchVolume(metrics.rawMonthlyMobileSearchVolume);
  if (pc.normalized == null || mobile.normalized == null) return "조회 안 됨";
  if (pc.isRange || mobile.isRange) {
    const exclusiveUpper =
      (pc.isRange ? pc.upperBound! : pc.normalized) +
      (mobile.isRange ? mobile.upperBound! : mobile.normalized);
    return `< ${exclusiveUpper.toLocaleString("ko-KR")}`;
  }
  return (metrics.totalMonthlySearchVolume ?? pc.normalized + mobile.normalized).toLocaleString(
    "ko-KR",
  );
}

export function classifyKeywordSize(
  total: number | null,
  thresholds: KeywordThresholds = keywordThresholds,
): KeywordSize {
  if (total == null || total < thresholds.smallMin) return "unclassified";
  if (total <= thresholds.smallMax) return "small";
  if (total >= thresholds.mediumMin && total <= thresholds.mediumMax) return "medium";
  if (total >= thresholds.largeMin) return "large";
  return "unclassified";
}

export function chunkKeywords(keywords: string[], size = 5) {
  const chunks: string[][] = [];
  for (let index = 0; index < keywords.length; index += size) {
    chunks.push(keywords.slice(index, index + size));
  }
  return chunks;
}

export function extractSmartstoreProductNo(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  const allowed =
    hostname === "smartstore.naver.com" ||
    hostname.endsWith(".smartstore.naver.com") ||
    hostname === "brand.naver.com" ||
    hostname.endsWith(".brand.naver.com");
  if (!allowed || url.protocol !== "https:") return null;
  const match = /\/products\/(\d+)(?:\/|$)/.exec(url.pathname);
  return match?.[1] ?? null;
}
