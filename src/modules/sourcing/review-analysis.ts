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
  "이쁜", "디자인이좋", "디자인이 좋",
];
const negativeWords = [
  "불편", "별로", "아쉬", "약해", "떨어", "깨져", "부서", "휘어", "녹", "작아",
  "좁아", "커서", "무거", "냄새", "날카", "어려", "불량", "고장", "미끄러", "새어",
  "안돼", "안되", "실망", "반품", "환불", "최악",
  "늦", "지연", "기다", "오래 걸",
  "딱딱", "까슬", "위험", "고통", "지저분", "얇아서", "물빠짐", "실용성",
];
const painPointCategories = [
  category("물이 잘 빠지지 않고 바닥이 오래 젖어 있음", /물\s*빠짐|배수|건조|물기.{0,12}(?:안\s*없|남아|오래)|마르.{0,6}(?:않|안\s*돼)|물이?\s*고여/),
  category("바닥이 얇아 구멍으로 물이 발에 올라옴", /바닥.{0,10}(?:얇|구멍)|구멍.{0,16}물.{0,8}(?:올라|들어)|물.{0,16}(?:역류|올라옵)/),
  category("딱딱하거나 까슬해 오래 신기 불편함", /딱딱|까슬|착화감|발바닥.{0,10}(?:아프|불편|고통)|오래.{0,8}(?:못\s*신|신기\s*어려)/),
  category("모서리나 표면 마감 때문에 다칠 위험이 있음", /날카|베이|다쳐|모퉁이|위험|고통/),
  category("크기나 폭이 맞지 않아 실제 사용이 불편함", /(?:크기|사이즈).{0,8}(?:크|작)|폭.{0,8}(?:넓|좁)|너무.{0,6}(?:크|작)|작아|좁아/),
  category("외관이나 마감이 지저분해 보임", /지저분|마감.{0,8}(?:나쁘|별로|거칠)|외관.{0,8}(?:별로|나쁘)/),
  category("디자인은 괜찮지만 실제 사용 기능이 부족함", /기능.{0,8}(?:없|전혀)|실용성.{0,8}(?:글쎄|없|떨어)|모양만|디자인.{0,16}(?:그런데|인데|지만).{0,16}(?:불편|기능|실용)/),
  category("가격에 비해 기능이 부족해 구매를 후회함", /비싼|가격.{0,8}(?:비싸|부담)|반품|환불|후회|돈.{0,6}(?:아깝|낭비)/),
  category("접착력이나 고정력이 약해 쉽게 떨어짐", /접착|떨어|고정.{0,8}(?:안|약)|흔들|빠져/),
  category("쉽게 깨지거나 휘어질 정도로 내구성이 약함", /깨져|깨짐|부서|휘어|약해|고장|망가|하중/),
  category("물에 닿으면 녹슬거나 부식될 우려가 있음", /녹|부식/),
  category("설치나 조립 과정이 어렵고 불편함", /설치.{0,10}(?:어려|불편|복잡)|조립.{0,10}(?:어려|불편|복잡)/),
  category("바닥이 미끄러워 넘어질 위험이 있음", /미끄러(?:워|움|져|짐)|미끄럼.{0,8}(?:심|위험|안\s*돼|없)/),
  category("물이 새거나 틈으로 흘러나옴", /새어|누수|물이\s*새/),
  category("소재에서 불쾌한 냄새가 남", /냄새/),
  category("배송이나 도착이 예상보다 늦음", /(?:배송|도착|출고|택배).{0,16}(?:늦|지연|오래|기다)|(?:늦|지연).{0,12}(?:배송|도착|출고|택배)/),
  category("실제 색상이 사진이나 화면과 다름", /(?:색상|색깔).{0,12}(?:다르|차이)|(?:사진|화면).{0,12}(?:다르|차이)/),
  category("구성품이 빠졌거나 수량이 부족함", /누락|구성품.{0,8}(?:빠져|부족)|수량.{0,8}(?:부족|다르)/),
];
const benefitCategories = [
  category("튼튼하고 견고하다는 평가가 있음", /튼튼|견고|내구|단단/),
  category("사용이 쉽고 편리하다는 평가가 있음", /편해|편리|쉬워|간편|잘돼|잘되/),
  category("디자인과 외관이 좋다는 평가가 있음", /디자인.{0,8}(?:좋|괜찮|예쁘|이쁘)|모양.{0,8}(?:좋|예쁘|이쁘|이쁜)|예뻐|이뻐|이쁜|깔끔/),
  category("크기와 수납 공간이 넉넉하다는 평가가 있음", /넉넉|수납.{0,8}(?:좋|많|넓)|용량.{0,8}(?:좋|크)/),
  category("무게가 가벼워 사용하기 좋다는 평가가 있음", /가벼/),
  category("배송이 빠르다는 평가가 있음", /빠른\s*배송|배송.{0,8}빠르|배송.{0,8}빨라/),
  category("제품에 전반적으로 만족한다는 평가가 있음", /좋아요|좋습니다|만족|추천|훌륭/),
];

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
  // A single review can contain both a positive aspect and multiple pain
  // points. Detect aspects across every review instead of discarding mixed
  // sentences based on one overall sentiment label.
  const allContents = classified.map((review) => review.content);
  const positiveTerms = categorizeReviewTypes(allContents, benefitCategories);
  const negativeTerms = categorizeReviewTypes(allContents, painPointCategories);
  const customerNeedCandidates = negativeTerms.map(({ term, count }) =>
    `${term} (${count}개 리뷰에서 확인)`,
  );
  const sellingPointCandidates = negativeTerms
    .slice(0, 5)
    .map(({ term }) => `샘플에서 확인: ${term}`);

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
  if (!terms.length) {
    return examples.length
      ? "분류된 유형 없음 · 원문 근거를 직접 확인하세요."
      : "";
  }
  return terms
    .map(({ term, count }) => `- ${term}: ${count}개 리뷰에서 확인${count >= 2 ? " (반복)" : " (개별)"}`)
    .join("\n");
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

function categorizeReviewTypes(
  contents: string[],
  categories: ReadonlyArray<{ label: string; matches: (content: string) => boolean }>,
) {
  return categories
    .map((category) => ({
      term: category.label,
      count: contents.filter((content) => category.matches(normalizeReview(content))).length,
    }))
    .filter(({ count }) => count > 0)
    .sort((left, right) => right.count - left.count || left.term.localeCompare(right.term, "ko"))
    .slice(0, 10);
}

function category(label: string, pattern: RegExp) {
  return { label, matches: (content: string) => pattern.test(content) };
}

function normalizeReview(content: string) {
  return content.normalize("NFKC").toLocaleLowerCase("ko-KR").replace(/\s+/g, " ");
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
