import type {
  GenerateTitleInput,
  KeywordGenerationClient,
} from "./keyword-generation-client";
import type {
  GeneratedKeywordCandidate,
  AnalysisResult,
  ManagedProductInput,
  ProductAnalysis,
} from "./types";
import {
  deduplicateKeywordCandidates,
  normalizeKeyword,
  sanitizeKeyword,
} from "./keyword-utils";
import {
  isGenericProductTypeToken,
  promotionalTitleTerms,
} from "./title-quality";
import { canonicalKeyword } from "./keyword-lexicon";
import { analyzeProductByRules } from "./rule-product-analyzer";
import { resolveProductTitleTemplate } from "./title-templates";

const stopwords = new Set<string>(promotionalTitleTerms);

export class RulesKeywordClient implements KeywordGenerationClient {
  async analyze(input: ManagedProductInput, candidateCount: number) {
    return createRulesAnalysis(input, candidateCount);
  }

  async generateTitle(input: GenerateTitleInput) {
    return {
      title: createRulesTitle(input),
      model: "rules-title-v1",
      source: "rules" as const,
    };
  }
}

export function createRulesAnalysis(
  input: ManagedProductInput,
  candidateCount: number,
): AnalysisResult {
  void candidateCount;
  const productAnalysis = analyzeProductByRules(input);
  return {
    productAnalysis,
    keywordCandidates: [],
    model: "rules-keyword-analysis-v1",
    source: "rules",
  };
}

export function createRuleKeywordCandidates(
  analysis: ProductAnalysis,
  candidateCount: number,
) {
  const productType = analysis.primaryProductType ?? analysis.productType;
  if (!productType || analysis.productTypeStatus !== "user_confirmed") return [];
  const directConcepts = unique([
    ...analysis.targetCustomers,
    ...analysis.materials,
    ...analysis.purposes,
    ...analysis.forms,
    ...analysis.features,
    ...analysis.colors,
    ...analysis.sizes,
    ...analysis.seasons,
    ...analysis.styles,
  ]).filter(
    (value) => normalizeKeyword(value) !== normalizeKeyword(productType),
  );
  const rawCandidates: GeneratedKeywordCandidate[] = [
    candidate(productType, [productType]),
    ...directConcepts.map((value) =>
      candidate(`${value} ${productType}`, [value, productType]),
    ),
    ...pairConcepts(directConcepts, productType),
  ];
  const rulesLimit = Math.max(5, Math.ceil(candidateCount / 2));
  return deduplicateKeywordCandidates(rawCandidates, rulesLimit);
}

export function createRulesTitle(input: GenerateTitleInput) {
  const banned = input.bannedWords.map(normalizeKeyword).filter(Boolean);
  const confirmedProductType = input.analysis.primaryProductType ?? input.analysis.productType;
  const productTypeTokens = new Set(tokenize(confirmedProductType).map(normalizeKeyword));
  const selectedTokens = unique(
    input.selectedKeywords
      .flatMap(tokenize)
      .map((token) => canonicalKeyword(token, input.productInput.category)),
  ).filter(
    (token) => !banned.some((word) => normalizeKeyword(token).includes(word)),
  );
  const productTypeIsSpecific = !isGenericProductTypeToken(confirmedProductType);
  const attributes = selectedTokens.filter(
    (token) =>
      !productTypeTokens.has(normalizeKeyword(token)) &&
      !(productTypeIsSpecific && isGenericProductTypeToken(token)),
  );
  const types = selectedTokens.filter((token) => productTypeTokens.has(normalizeKeyword(token)));
  const fallbackType = tokenize(confirmedProductType).filter(
    (token) => !banned.some((word) => normalizeKeyword(token).includes(word)),
  );
  const typeTerms = types.length ? types : fallbackType;
  const template = resolveProductTitleTemplate(input.productInput.category);
  const ordered = unique(
    template.order === "type-first"
      ? [...typeTerms, ...attributes]
      : [...attributes, ...typeTerms],
  );
  while (ordered.join(" ").length > input.maximumLength && ordered.length > 1) {
    const removableIndex = findLastAttributeIndex(ordered, typeTerms);
    if (removableIndex < 0) break;
    ordered.splice(removableIndex, 1);
  }
  const title = sanitizeKeyword(ordered.join(" "));
  if (!title) throw new Error("선택한 키워드로 상품명 초안을 만들 수 없습니다.");
  return title.slice(0, input.maximumLength).trim();
}

function findLastAttributeIndex(ordered: string[], typeTerms: string[]) {
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const token = ordered[index]!;
    const isType = typeTerms.some(
      (type) => normalizeKeyword(type) === normalizeKeyword(token),
    );
    if (!isType) return index;
  }
  return -1;
}

function candidate(keyword: string, sourceConcepts: string[]): GeneratedKeywordCandidate {
  return {
    keyword,
    reason: "상품 입력값을 조합한 규칙 기반 후보입니다.",
    sourceConcepts,
  };
}

function pairConcepts(concepts: string[], productType: string) {
  const result: GeneratedKeywordCandidate[] = [];
  for (let left = 0; left < concepts.length; left += 1) {
    for (let right = left + 1; right < concepts.length; right += 1) {
      const first = concepts[left]!;
      const second = concepts[right]!;
      result.push(candidate(`${first} ${second} ${productType}`, [first, second, productType]));
      if (result.length >= 20) return result;
    }
  }
  return result;
}

function tokenize(value: string) {
  return unique(
    value
      .normalize("NFKC")
      .replace(/[>｜|/,[\](){}]+/g, " ")
      .split(/\s+/)
      .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
      .filter((token) => token.length > 1 && !stopwords.has(token)),
  );
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const clean = sanitizeKeyword(value);
    const normalized = normalizeKeyword(clean);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
