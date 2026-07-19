import { canonicalKeyword, keywordLexicon } from "./keyword-lexicon";
import { isGenericProductTypeToken, promotionalTitleTerms } from "./title-quality";
import { normalizeKeyword, sanitizeKeyword } from "./keyword-utils";
import type { ManagedProductInput, ProductAnalysis } from "./types";

export function analyzeProductByRules(input: ManagedProductInput): ProductAnalysis {
  const tokens = tokenize(input.supplierTitle);
  const categoryLeaf = sanitizeKeyword(input.category.split(/[>＞]/).at(-1) ?? "");
  const categoryTokens = tokenize(categoryLeaf);
  const materials = collect(tokens, keywordLexicon.materials, input.materials, input.category);
  const purposes = collect(tokens, keywordLexicon.purposes, [], input.category);
  const targets = collect(tokens, keywordLexicon.targets, [input.target], input.category);
  const forms = collect(tokens, keywordLexicon.forms, [], input.category);
  const features = collect(tokens, keywordLexicon.features, input.features, input.category);
  const colors = collect(tokens, keywordLexicon.colors, input.colors, input.category);
  const sizes = unique(input.sizes.map((item) => canonicalKeyword(item, input.category)));
  const seasons = collect(tokens, keywordLexicon.seasons, input.seasons, input.category);
  const styles = collect(tokens, keywordLexicon.styles, [], input.category);
  const categoryTerms = unique(
    [...tokens, ...categoryTokens]
      .filter((token) =>
        keywordLexicon.categoryTerms.some((term) => normalizeKeyword(token).includes(normalizeKeyword(term))),
      ),
  );
  const classifiedValues = [
      ...materials, ...purposes, ...targets, ...forms, ...features, ...colors,
      ...sizes, ...seasons, ...styles, ...categoryTerms,
      ...keywordLexicon.promotionalTerms, ...promotionalTitleTerms,
    ];
  const assigned = new Set(
    classifiedValues.flatMap((value) => [value, ...tokenize(value)]).map(normalizeKeyword),
  );
  const possibleTypes = unique(
    tokens.filter((token) => {
      const normalized = normalizeKeyword(canonicalKeyword(token, input.category));
      return (
        !assigned.has(normalized) &&
        !isGenericProductTypeToken(token) &&
        !keywordLexicon.abstractTerms.some((term) => normalized === normalizeKeyword(term)) &&
        /\p{L}/u.test(token)
      );
    }),
  );
  const specificCategoryType =
    categoryLeaf &&
    !/^\d+$/.test(categoryLeaf) &&
    !isGenericProductTypeToken(categoryLeaf) &&
    !keywordLexicon.categoryTerms.some((term) => categoryLeaf.endsWith(term))
      ? canonicalKeyword(categoryLeaf, input.category)
      : "";
  const productTypes = unique([
    ...(specificCategoryType ? [specificCategoryType] : []),
    ...possibleTypes,
  ]);
  const categoryMatchesTitle =
    Boolean(specificCategoryType) &&
    normalizeKeyword(input.supplierTitle).includes(normalizeKeyword(specificCategoryType));
  const primaryProductType = categoryMatchesTitle
    ? specificCategoryType
    : productTypes.length === 1
      ? productTypes[0]!
      : null;
  const productTypeStatus = primaryProductType
    ? "rule_confirmed"
    : "review_required";
  const productType = primaryProductType ?? "";
  const classified = new Set(
    [...productTypes, ...Array.from(assigned)].map(normalizeKeyword),
  );
  const unclassifiedTerms = unique(
    tokens.filter(
      (token) =>
        !classified.has(normalizeKeyword(token)) &&
        !keywordLexicon.promotionalTerms.some(
          (term) => normalizeKeyword(token) === normalizeKeyword(term),
        ),
    ),
  );

  return {
    productType,
    productTypes,
    primaryProductType,
    productTypeStatus,
    targetCustomers: targets,
    materials,
    purposes,
    forms,
    features,
    colors,
    sizes,
    styles,
    seasons,
    useCases: purposes,
    categoryTerms,
    unclassifiedTerms,
    searchConcepts: [],
    analysisSource: "rule-based",
    userReviewedAt: null,
  };
}

function collect(
  tokens: string[],
  dictionary: readonly string[],
  explicit: string[],
  category: string,
) {
  return unique([
    ...explicit.map((item) => canonicalKeyword(item, category)),
    ...tokens.flatMap((token) => {
      const found = dictionary.find((term) => normalizeKeyword(token).includes(normalizeKeyword(term)));
      return found ? [canonicalKeyword(found, category)] : [];
    }),
  ]);
}

function tokenize(value: string) {
  return unique(
    value
      .normalize("NFKC")
      .replace(/[>｜|/,[\](){}]+/g, " ")
      .split(/\s+/)
      .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
      .filter((token) => token.length > 1),
  );
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeKeyword(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
