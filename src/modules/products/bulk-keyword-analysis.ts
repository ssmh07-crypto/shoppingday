import type { ProductKeywordDraft } from "@/lib/db/schema";
import type { KeywordMetrics } from "@/modules/keywords/types";
import { assessSearchTag, isBlockingSearchTagIssue } from "@/modules/keywords/search-tag-quality";

export type BulkKeywordProduct = {
  id: string;
  title: string;
  originalName: string | null;
  naverCategoryId: string | null;
  naverCategoryName: string | null;
  sourceTitleKeywords: string[];
  searchTags: string[];
  draftVersion: number;
};

export type OfficialTag = { code: number; text: string };

export type BulkKeywordPreview = {
  id: string;
  previousTitle: string;
  proposedTitle: string;
  previousTags: string[];
  proposedTags: string[];
  draftVersion: number;
  seed: string;
  candidateCount: number;
  keywordDrafts: ProductKeywordDraft[];
  warning: string | null;
};

export interface RelatedKeywordReader {
  discoverKeywordMetrics(hints: string[], limit: number): Promise<KeywordMetrics[]>;
}

export interface OfficialTagReader {
  fetchRecommendTags(keyword: string): Promise<OfficialTag[]>;
}

export async function analyzeBulkProductKeywords(
  products: BulkKeywordProduct[],
  relatedReader: RelatedKeywordReader,
  tagReader: OfficialTagReader | null,
  now = new Date(),
): Promise<BulkKeywordPreview[]> {
  const groups = groupProducts(products);
  const previews: BulkKeywordPreview[] = [];

  // Search Ads may return 429 when several keyword-tool calls overlap. Process
  // category groups in sequence and reuse each response for every product in it.
  for (const group of groups.values()) {
    const seeds = unique(group.flatMap(productSeeds)).slice(0, 5);
    const metrics = await relatedReader.discoverKeywordMetrics(seeds, 50);
    const tagResults: OfficialTag[][] = [];
    if (tagReader) {
      for (const seed of seeds.slice(0, 3)) {
        tagResults.push(await tagReader.fetchRecommendTags(seed));
      }
    }
    const officialTags = uniqueTags(tagResults.flat());

    for (const product of group) {
      previews.push(buildPreview(product, metrics, officialTags, tagReader !== null, now));
    }
  }
  return previews;
}

function groupProducts(products: BulkKeywordProduct[]) {
  const groups = new Map<string, BulkKeywordProduct[]>();
  for (const product of products) {
    const key = product.naverCategoryId ?? "uncategorized";
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  return groups;
}

function buildPreview(
  product: BulkKeywordProduct,
  metrics: KeywordMetrics[],
  officialTags: OfficialTag[],
  tagLookupConfigured: boolean,
  now: Date,
): BulkKeywordPreview {
  const seeds = productSeeds(product);
  const anchors = unique([...seeds, ...tokenize(product.originalName ?? product.title)]);
  const relevant = metrics
    .filter((item) => isRelevant(item.keyword, anchors))
    .sort(compareMetrics)
    .slice(0, 30);
  const titleCandidates = relevant
    .filter((item) => (item.totalMonthlySearchVolume ?? 0) >= 100)
    .slice(0, 3)
    .map((item) => clean(item.keyword));
  const proposedTitle = composeTitle(titleCandidates, anchors, product.title);
  const proposedTags = officialTags
    .map((tag) => clean(tag.text))
    .filter((tag) => isRelevant(tag, anchors))
    .filter((tag) => !compact(proposedTitle).includes(compact(tag)))
    .filter((tag) => !assessSearchTag(tag, { title: proposedTitle }).some(isBlockingSearchTagIssue))
    .filter(uniqueFilter)
    .slice(0, 10);
  const importedAt = now.toISOString();
  const tagSet = new Set(proposedTags.map(compact));
  const title = compact(proposedTitle);
  const keywordDrafts: ProductKeywordDraft[] = relevant.map((item) => ({
    id: crypto.randomUUID(),
    keyword: clean(item.keyword),
    normalizedKeyword: compact(item.keyword),
    monthlySearchVolume: item.totalMonthlySearchVolume,
    placement: title.includes(compact(item.keyword))
      ? "product_name"
      : tagSet.has(compact(item.keyword))
        ? "tag"
        : "unclassified",
    source: "naver-search-ad",
    importedAt,
  }));
  return {
    id: product.id,
    previousTitle: product.title,
    proposedTitle,
    previousTags: product.searchTags,
    proposedTags: proposedTags.length ? proposedTags : product.searchTags,
    draftVersion: product.draftVersion,
    seed: seeds[0] ?? product.title,
    candidateCount: relevant.length,
    keywordDrafts,
    warning: relevant.length
      ? tagLookupConfigured && !proposedTags.length
        ? "공식 추천 태그 중 상품과 직접 관련된 태그를 찾지 못해 기존 태그를 유지합니다."
        : null
      : "상품과 직접 관련된 연관 키워드를 찾지 못해 기존 상품명과 태그를 유지합니다.",
  };
}

function productSeeds(product: BulkKeywordProduct) {
  const category = clean(product.naverCategoryName ?? "").split(">").at(-1) ?? "";
  const titleTokens = tokenize(product.originalName ?? product.title);
  return unique([
    ...product.sourceTitleKeywords,
    category,
    ...titleTokens.slice(-3).reverse(),
  ]).filter((value) => value.length >= 2);
}

function composeTitle(candidates: string[], anchors: string[], fallback: string) {
  const parts = unique([...candidates, ...anchors]);
  let title = "";
  for (const part of parts) {
    if (part.length < 2 || compact(title).includes(compact(part))) continue;
    const next = title ? `${title} ${part}` : part;
    if (next.length > 50) continue;
    title = next;
  }
  return title || fallback;
}

function isRelevant(keyword: string, anchors: string[]) {
  const value = compact(keyword);
  return value.length >= 2 && anchors.some((anchor) => {
    const key = compact(anchor);
    return key.length >= 2 && (value.includes(key) || key.includes(value));
  });
}

function compareMetrics(left: KeywordMetrics, right: KeywordMetrics) {
  const leftUseful = usefulRange(left.totalMonthlySearchVolume);
  const rightUseful = usefulRange(right.totalMonthlySearchVolume);
  return rightUseful - leftUseful ||
    (right.totalMonthlySearchVolume ?? -1) - (left.totalMonthlySearchVolume ?? -1) ||
    left.keyword.localeCompare(right.keyword, "ko");
}

function usefulRange(value: number | null) {
  return value != null && value >= 100 && value <= 1_000 ? 1 : 0;
}

function tokenize(value: string) {
  return unique(
    clean(value)
      .replace(/[()[\]{}<>/,_|+\-]+/g, " ")
      .split(/\s+/)
      .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
      .filter((token) => token.length >= 2 && !noiseTerms.has(compact(token)))
      .filter((token) => !/^\d+$/.test(token)),
  );
}

const noiseTerms = new Set([
  "무료배송", "정품", "신상품", "인기", "추천", "특가", "할인", "이벤트",
  "국내배송", "당일배송", "상품", "제품", "세트",
]);

function clean(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function compact(value: string) {
  return clean(value).replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.map(clean).filter((value) => {
    const key = compact(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueTags(tags: OfficialTag[]) {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = compact(tag.text);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function uniqueFilter(value: string, index: number, values: string[]) {
  return values.findIndex((candidate) => compact(candidate) === compact(value)) === index;
}
