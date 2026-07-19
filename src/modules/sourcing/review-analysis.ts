type SpreadsheetCell = string | number | boolean | Date | null | undefined;

export interface SourcingReviewEntry {
  content: string;
  rating: number | null;
}

export interface ReviewTerm {
  term: string;
  count: number;
}

export interface SourcingReviewAnalysis {
  totalCount: number;
  positiveCount: number;
  negativeCount: number;
  neutralCount: number;
  positiveTerms: ReviewTerm[];
  negativeTerms: ReviewTerm[];
  positiveExamples: string[];
  negativeExamples: string[];
  customerNeedCandidates: string[];
  sellingPointCandidates: string[];
}

const positiveWords = [
  "좋아요", "좋습니다", "만족", "튼튼", "편해", "편리", "깔끔", "예뻐", "이뻐",
  "추천", "빠르", "잘돼", "잘되", "좋은", "훌륭", "견고", "넉넉", "가벼",
];
const negativeWords = [
  "불편", "별로", "아쉬", "약해", "떨어", "깨져", "부서", "휘어", "녹", "작아",
  "좁아", "커서", "무거", "냄새", "날카", "어려", "불량", "고장", "미끄러", "새어",
  "안돼", "안되", "실망", "반품", "환불", "최악",
];
const painPointCategories = [
  { label: "접착력과 고정력", words: ["접착", "떨어", "고정"] },
  { label: "내구성과 하중", words: ["깨져", "부서", "휘어", "튼튼", "약해", "고장"] },
  { label: "내식성과 녹 방지", words: ["녹", "부식"] },
  { label: "실사용 크기와 수납 용량", words: ["작아", "좁아", "커서", "사이즈", "수납"] },
  { label: "설치 편의성", words: ["설치", "어려", "조립"] },
  { label: "모서리 마감과 안전성", words: ["날카", "베이", "다쳐"] },
  { label: "미끄럼 방지", words: ["미끄러", "미끄럼"] },
  { label: "누수 방지", words: ["새어", "누수", "물이새"] },
  { label: "소재 냄새", words: ["냄새"] },
];
const stopWords = new Set([
  "그리고", "그런데", "하지만", "그래서", "정말", "너무", "조금", "그냥", "제품",
  "상품", "사용", "구매", "배송", "생각", "정도", "같아요", "있어요", "없어요", "합니다",
  "했어요", "입니다", "이네요", "같습니다", "때문", "부분", "이번", "하나", "이거", "저거",
]);

export async function parseReviewFile(file: File): Promise<SourcingReviewEntry[]> {
  const extension = file.name.split(".").pop()?.toLocaleLowerCase();
  if (extension === "csv") return parseReviewCsv(await file.text());
  if (extension === "xlsx") {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    const sheets = await readXlsxFile(file);
    let lastError: unknown;
    for (const sheet of sheets) {
      try {
        return parseReviewRows(sheet.data as unknown as SpreadsheetCell[][]);
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("리뷰 시트를 찾지 못했습니다.");
  }
  throw new Error("CSV 또는 XLSX 리뷰 파일만 사용할 수 있습니다.");
}

export function parsePastedReviews(text: string): SourcingReviewEntry[] {
  const normalized = text.normalize("NFKC").trim();
  if (!normalized) return [];
  const blocks = normalized.includes("\n\n")
    ? normalized.split(/\n\s*\n+/)
    : normalized.split(/\n+/);
  return dedupeReviews(blocks.map(parseReviewText).filter(isReviewEntry));
}

export function parseReviewRows(rows: SpreadsheetCell[][]): SourcingReviewEntry[] {
  if (rows.length < 2) throw new Error("리뷰 데이터가 없는 파일입니다.");
  const headers = rows[0]!.map((cell) => stringValue(cell).replace(/\s+/g, ""));
  const contentIndex = findHeader(headers, ["리뷰내용", "상품리뷰", "구매평", "리뷰", "내용"]);
  const ratingIndex = findHeader(headers, ["평점", "별점", "만족도"]);
  if (contentIndex < 0) throw new Error("파일에서 리뷰 내용 열을 찾지 못했습니다.");
  const reviews = rows.slice(1).map((row) => ({
    content: stringValue(row[contentIndex]),
    rating: ratingIndex < 0 ? null : ratingValue(row[ratingIndex]),
  })).filter(isReviewEntry);
  if (!reviews.length) throw new Error("분석할 리뷰 내용이 없습니다.");
  return dedupeReviews(reviews);
}

export function parseReviewCsv(csv: string) {
  return parseReviewRows(parseCsvRows(csv));
}

export function analyzeReviews(reviews: SourcingReviewEntry[]): SourcingReviewAnalysis {
  if (!reviews.length) throw new Error("분석할 리뷰를 입력해 주세요.");
  const classified = reviews.map((review) => ({ ...review, sentiment: sentimentOf(review) }));
  const positive = classified.filter((review) => review.sentiment === "positive");
  const negative = classified.filter((review) => review.sentiment === "negative");
  const neutral = classified.filter((review) => review.sentiment === "neutral");
  const positiveTerms = frequentTerms(positive.map((review) => review.content));
  const negativeTerms = frequentTerms(negative.map((review) => review.content));
  const painPoints = categorizePainPoints(negative.map((review) => review.content));
  const customerNeedCandidates = painPoints.length
    ? painPoints.map(({ label, count }) => `${label} 개선 필요 (${count}개 리뷰에서 확인)`)
    : negativeTerms.slice(0, 8).map(({ term, count }) => `${term} 관련 불편 개선 필요 (${count}회 언급)`);
  const sellingPointCandidates = (painPoints.length
    ? painPoints.map(({ label }) => label)
    : negativeTerms.slice(0, 5).map(({ term }) => term)
  ).slice(0, 5).map((point) => `${point} 항목을 샘플에서 우선 확인`);

  return {
    totalCount: reviews.length,
    positiveCount: positive.length,
    negativeCount: negative.length,
    neutralCount: neutral.length,
    positiveTerms,
    negativeTerms,
    positiveExamples: representativeExamples(positive),
    negativeExamples: representativeExamples(negative),
    customerNeedCandidates,
    sellingPointCandidates,
  };
}

export function formatReviewEvidence(terms: ReviewTerm[], examples: string[]) {
  const lines: string[] = [];
  if (terms.length) lines.push(`반복 표현: ${terms.map(({ term, count }) => `${term}(${count}회)`).join(", ")}`);
  if (examples.length) lines.push(...examples.map((example) => `- ${example}`));
  return lines.join("\n");
}

function sentimentOf(review: SourcingReviewEntry) {
  if (review.rating !== null) {
    if (review.rating >= 4) return "positive" as const;
    if (review.rating <= 3) return "negative" as const;
  }
  const positiveScore = positiveWords.filter((word) => review.content.includes(word)).length;
  const negativeScore = negativeWords.filter((word) => review.content.includes(word)).length;
  if (positiveScore > negativeScore) return "positive" as const;
  if (negativeScore > positiveScore) return "negative" as const;
  return "neutral" as const;
}

function frequentTerms(contents: string[]) {
  const counts = new Map<string, number>();
  for (const content of contents) {
    const tokens = new Set(
      content.normalize("NFKC").toLocaleLowerCase("ko-KR")
        .match(/[가-힣a-z0-9]{2,}/g)
        ?.filter((token) => !stopWords.has(token)) ?? [],
    );
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= (contents.length >= 5 ? 2 : 1))
    .sort(([leftTerm, leftCount], [rightTerm, rightCount]) =>
      rightCount - leftCount || leftTerm.localeCompare(rightTerm, "ko"),
    )
    .slice(0, 10)
    .map(([term, count]) => ({ term, count }));
}

function categorizePainPoints(contents: string[]) {
  return painPointCategories
    .map((category) => ({
      label: category.label,
      count: contents.filter((content) => category.words.some((word) => content.includes(word))).length,
    }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ko"))
    .slice(0, 8);
}

function representativeExamples(reviews: Array<SourcingReviewEntry & { sentiment: string }>) {
  return reviews
    .map((review) => review.content.replace(/\s+/g, " ").trim())
    .sort((left, right) => right.length - left.length)
    .slice(0, 8)
    .map((content) => content.length > 180 ? `${content.slice(0, 177)}…` : content);
}

function parseReviewText(value: string): SourcingReviewEntry | null {
  const content = value.trim();
  if (!content) return null;
  const leading = content.match(/^\s*(?:\[?\s*(?:별점\s*)?([1-5])\s*(?:점|\/\s*5)\s*\]?|([1-5])\s*[:|,\-])\s*(.+)$/s);
  if (leading?.[3]) return { rating: Number(leading[1] ?? leading[2]), content: leading[3].trim() };
  return { rating: null, content };
}

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]!;
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
    } else cell += character;
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function findHeader(headers: string[], candidates: string[]) {
  return headers.findIndex((header) => candidates.some((candidate) => header === candidate || header.includes(candidate)));
}
function stringValue(value: SpreadsheetCell) { return value == null ? "" : String(value).normalize("NFKC").trim(); }
function ratingValue(value: SpreadsheetCell) {
  const match = stringValue(value).match(/[1-5](?:\.0)?/);
  return match ? Number(match[0]) : null;
}
function isReviewEntry(review: SourcingReviewEntry | null): review is SourcingReviewEntry { return Boolean(review?.content); }
function dedupeReviews(reviews: SourcingReviewEntry[]) {
  const seen = new Set<string>();
  return reviews.filter((review) => {
    const key = review.content.replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
