import type { SourcingRelatedKeyword } from "./types";

const TITLE_LIMIT = 50;
const TITLE_REVIEW_LENGTH = 40;
const TAG_LIMIT = 20;
const TAG_LENGTH_LIMIT = 30;
const PROMOTIONAL_TERMS = [
  "무료배송",
  "정품",
  "신상품",
  "인기",
  "추천",
  "특가",
  "할인",
  "이벤트",
  "국내배송",
  "당일배송",
  "1+1",
] as const;
const GENERIC_PRODUCT_TERMS = [
  "부자재",
  "용품",
  "상품",
  "제품",
  "세트",
  "도구",
] as const;

export interface SourcingRegistrationDraft {
  title: string;
  titleCandidates: string[];
  usedTitleKeywords: string[];
  searchTags: string[];
  tagCandidates: string[];
  attributeKeywords: string[];
  categoryKeywords: string[];
  warnings: string[];
}

export function buildSourcingRegistrationDraft(
  sourcingKeyword: string,
  relatedKeywords: SourcingRelatedKeyword[],
  options: { preferredTitleKeyword?: string } = {},
): SourcingRegistrationDraft {
  const eligibleTitleCandidates = eligibleLowVolumeKeywords(
    relatedKeywords,
    "product_name",
  );
  const titleCandidates = eligibleTitleCandidates.map(
    (candidate) => candidate.keyword,
  );
  const diverseTitleKeywords = selectDiverseTitleKeywords(
    sourcingKeyword,
    eligibleTitleCandidates,
    options.preferredTitleKeyword,
  );
  const titleKeywords = orderTitleKeywordsForDisplay(
    diverseTitleKeywords.selected,
  );
  const tagCandidates = sortedTagKeywords(relatedKeywords);
  const selectableTagKeywords = tagCandidates.filter(
    (keyword) => keyword.length <= TAG_LENGTH_LIMIT,
  );
  const attributeKeywords = sortedKeywords(relatedKeywords, "attribute");
  const categoryKeywords = sortedKeywords(relatedKeywords, "category");
  const warnings: string[] = [];

  const composedTitle = composeTitle(
    sourcingKeyword,
    titleKeywords,
    diverseTitleKeywords.selected[0]?.keyword,
    (
      diverseTitleKeywords.selected.find((candidate) => {
        const part = connectedTitlePart(sourcingKeyword, candidate.keyword);
        return (
          part &&
          normalizeKeyword(part.productType) !==
            normalizeKeyword(sourcingKeyword) &&
          titleModifierTheme(part.modifier) === "origin"
        );
      }) ??
      diverseTitleKeywords.selected.find((candidate) => {
        const part = connectedTitlePart(sourcingKeyword, candidate.keyword);
        return (
          part &&
          normalizeKeyword(part.productType) !==
            normalizeKeyword(sourcingKeyword)
        );
      })
    )?.keyword,
  );
  const limitedTitle = composeWithinLimit(
    composedTitle.base,
    composedTitle.modifiers,
    TITLE_LIMIT,
    {
      primaryModifier: composedTitle.primaryModifier,
      alternateModifier: composedTitle.alternateAnchor?.modifier,
      alternateProductType: composedTitle.alternateAnchor?.productType,
    },
  );
  const title = limitedTitle.title;
  const usedTitleKeywords = uniqueKeywords(
    [
      composedTitle.baseSourceKeyword,
      ...composedTitle.modifierSources
        .filter((source) =>
          limitedTitle.selectedModifiers.includes(source.modifier),
        )
        .map((source) => source.keyword),
    ].filter((keyword): keyword is string => keyword !== null),
  );
  const searchTags = selectableTagKeywords.slice(0, TAG_LIMIT);

  if (!titleKeywords.length) {
    warnings.push("검색수 1,000 이하로 분류된 상품명 키워드가 없습니다.");
  }
  if (composedTitle.removedPromotionalTerms.length) {
    warnings.push(
      `홍보성 표현은 상품명에서 제외했습니다: ${composedTitle.removedPromotionalTerms.join(", ")}`,
    );
  }
  if (composedTitle.removedGenericTerms.length) {
    warnings.push(
      `구체적인 상품 유형과 중복되는 넓은 분류어는 제외했습니다: ${composedTitle.removedGenericTerms.join(", ")}`,
    );
  }
  const excludedUnrelatedKeywords = uniqueKeywords([
    ...diverseTitleKeywords.excludedUnrelated,
    ...composedTitle.excludedUnrelatedKeywords,
  ]);
  if (excludedUnrelatedKeywords.length) {
    warnings.push(
      `기본 상품 유형과 연결되지 않은 키워드는 나열하지 않았습니다: ${excludedUnrelatedKeywords.join(", ")}`,
    );
  }
  if (diverseTitleKeywords.excludedRedundant.length) {
    warnings.push(
      `의미가 겹치는 상품명 키워드는 기준 검색어와 검색수가 우선인 표현 하나만 사용했습니다: ${diverseTitleKeywords.excludedRedundant.join(", ")}`,
    );
  }
  if (limitedTitle.selectedModifiers.length < composedTitle.modifiers.length) {
    warnings.push(
      `상품명이 ${TITLE_LIMIT}자를 넘지 않도록 일부 수식 키워드를 제외했습니다.`,
    );
  }
  if (title.length > TITLE_REVIEW_LENGTH) {
    warnings.push(
      "상품명이 40자를 넘습니다. 40자는 내부 검토 기준이며 네이버 공식 제한은 아닙니다. 핵심 상품을 바로 파악할 수 있는지 확인해 주세요.",
    );
  }
  if (tagCandidates.some((keyword) => keyword.length > TAG_LENGTH_LIMIT)) {
    warnings.push("30자를 넘는 태그 후보는 표시하지만 상품 등록 태그로 선택할 수 없습니다.");
  }
  if (selectableTagKeywords.length > TAG_LIMIT) {
    warnings.push("태그 후보 전체를 추출했습니다. 상품 등록에는 최대 20개를 직접 선택해 주세요.");
  }
  if (attributeKeywords.length) {
    warnings.push("속성 키워드는 네이버 카테고리의 공식 속성값과 직접 대조해야 합니다.");
  }
  if (categoryKeywords.length) {
    warnings.push("카테고리 키워드는 상품명에 포함하지 않고 카테고리 선택 참고값으로만 사용합니다.");
  }

  return {
    title,
    titleCandidates,
    usedTitleKeywords,
    searchTags,
    tagCandidates,
    attributeKeywords,
    categoryKeywords,
    warnings,
  };
}

function selectDiverseTitleKeywords(
  sourcingKeyword: string,
  keywords: Array<{ keyword: string; monthlySearchVolume: number }>,
  preferredKeyword: string | undefined,
) {
  const preferredNormalized = normalizeKeyword(preferredKeyword ?? "");
  const seen = new Set<string>();
  const candidates = keywords.flatMap((entry, index) => {
    const normalized = normalizeKeyword(entry.keyword);
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    const connectedPart = connectedTitlePart(
      sourcingKeyword,
      entry.keyword,
    );
    const modifier = cleanTitlePart(
      connectedPart?.modifier ?? normalized,
    ).value;
    return {
      keyword: entry.keyword,
      index,
      monthlySearchVolume: entry.monthlySearchVolume,
      modifier,
      theme: titleModifierTheme(modifier),
      connected: connectedPart !== null,
      preferred:
        Boolean(preferredNormalized) && normalized === preferredNormalized,
    };
  });
  const selected: typeof candidates = [];
  const excludedRedundant: string[] = [];
  const excludedUnrelated: string[] = [];

  for (const candidate of candidates) {
    if (!candidate.connected) {
      excludedUnrelated.push(candidate.keyword);
      continue;
    }
    const conflictIndex = selected.findIndex((existing) =>
      modifiersOverlap(existing, candidate),
    );
    if (conflictIndex < 0) {
      selected.push(candidate);
      continue;
    }

    const existing = selected[conflictIndex]!;
    if (isBetterThemeCandidate(candidate, existing)) {
      selected[conflictIndex] = candidate;
      excludedRedundant.push(existing.keyword);
    } else {
      excludedRedundant.push(candidate.keyword);
    }
  }

  return {
    selected: selected
      .sort((left, right) => {
        if (left.preferred !== right.preferred) {
          return left.preferred ? -1 : 1;
        }
        return (
          right.monthlySearchVolume - left.monthlySearchVolume ||
          left.index - right.index
        );
      })
      .map((candidate) => ({
        keyword: candidate.keyword,
        theme: candidate.theme,
        preferred: candidate.preferred,
      })),
    excludedRedundant: uniqueKeywords(excludedRedundant),
    excludedUnrelated: uniqueKeywords(excludedUnrelated),
  };
}

function isBetterThemeCandidate(
  candidate: {
    preferred: boolean;
    monthlySearchVolume: number;
    modifier: string;
  },
  existing: {
    preferred: boolean;
    monthlySearchVolume: number;
    modifier: string;
  },
) {
  if (candidate.preferred !== existing.preferred) return candidate.preferred;
  if (candidate.monthlySearchVolume !== existing.monthlySearchVolume) {
    return candidate.monthlySearchVolume > existing.monthlySearchVolume;
  }
  return (
    normalizeKeyword(candidate.modifier).length >
    normalizeKeyword(existing.modifier).length
  );
}

function orderTitleKeywordsForDisplay(
  candidates: Array<{
    keyword: string;
    theme: string | null;
    preferred: boolean;
  }>,
) {
  return [...candidates]
    .sort((left, right) => {
      if (left.preferred !== right.preferred) {
        return left.preferred ? -1 : 1;
      }
      return titleThemePriority(left.theme) - titleThemePriority(right.theme);
    })
    .map((candidate) => candidate.keyword);
}

function modifiersOverlap(
  left: { modifier: string; theme: string | null },
  right: { modifier: string; theme: string | null },
) {
  const leftModifier = normalizeKeyword(left.modifier);
  const rightModifier = normalizeKeyword(right.modifier);
  if (!leftModifier || !rightModifier) return false;
  if (left.theme && left.theme === right.theme) return true;
  return (
    leftModifier.includes(rightModifier) ||
    rightModifier.includes(leftModifier)
  );
}

function titleModifierTheme(modifier: string): string | null {
  const normalized = normalizeKeyword(modifier);
  if (/문.*걸|안.*걸|낮|저상|슬림|로우|발등/.test(normalized)) {
    return "low-profile";
  }
  if (/앞막|막힌|오픈토|발가락/.test(normalized)) return "toe-design";
  if (/물빠|배수/.test(normalized)) return "drainage";
  if (/건조|속건/.test(normalized)) return "quick-dry";
  if (/미끄럼|미끄러|미끄럽|논슬립/.test(normalized)) return "non-slip";
  if (/쿠션|폭신|푹신|착화감/.test(normalized)) return "comfort";
  if (/경량|가벼/.test(normalized)) return "lightweight";
  if (/대형|빅사이즈|와이드|넓|\d{3}/.test(normalized)) return "size";
  if (/예쁜|이쁜/.test(normalized)) return "appearance";
  if (/국산|국내산/.test(normalized)) return "origin";
  if (/eva/.test(normalized)) return "material";
  if (/항균/.test(normalized)) return "hygiene";
  return null;
}

function titleThemePriority(theme: string | null) {
  const priorities: Record<string, number> = {
    "low-profile": 0,
    "non-slip": 1,
    drainage: 2,
    "quick-dry": 3,
    comfort: 4,
    lightweight: 5,
    size: 6,
    "toe-design": 7,
    appearance: 8,
    origin: 9,
    material: 10,
    hygiene: 11,
  };
  return theme ? (priorities[theme] ?? 12) : 12;
}

export function categoryKeywordsInTitle(title: string, categoryKeywords: string[]) {
  const titleTokens = title
    .normalize("NFKC")
    .toLocaleLowerCase("ko-KR")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

  return categoryKeywords.filter((keyword) => {
    const keywordTokens = keyword
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    if (!keywordTokens.length || keywordTokens.length > titleTokens.length) return false;
    return titleTokens.some((_, index) =>
      keywordTokens.every((token, offset) => titleTokens[index + offset] === token),
    );
  });
}

function eligibleLowVolumeKeywords(
  keywords: SourcingRelatedKeyword[],
  placement: "product_name",
) {
  return keywords
    .filter(
      (keyword) =>
        keyword.placement === placement &&
        keyword.monthlySearchVolume !== null &&
        keyword.monthlySearchVolume <= 1_000,
    )
    .sort(compareByVolumeThenKeyword)
    .map((keyword) => ({
      keyword: keyword.keyword,
      monthlySearchVolume: keyword.monthlySearchVolume!,
    }));
}

function sortedTagKeywords(keywords: SourcingRelatedKeyword[]) {
  return uniqueKeywords(
    keywords
      .filter((keyword) => keyword.placement === "tag")
      .sort(compareByVolumeThenKeyword)
      .map((keyword) => keyword.keyword),
  );
}

function sortedKeywords(
  keywords: SourcingRelatedKeyword[],
  placement: "attribute" | "category",
) {
  return uniqueKeywords(
    keywords
      .filter((keyword) => keyword.placement === placement)
      .sort(compareByVolumeThenKeyword)
      .map((keyword) => keyword.keyword),
  );
}

function compareByVolumeThenKeyword(
  left: SourcingRelatedKeyword,
  right: SourcingRelatedKeyword,
) {
  const volumeDifference =
    (right.monthlySearchVolume ?? -1) - (left.monthlySearchVolume ?? -1);
  return volumeDifference || left.keyword.localeCompare(right.keyword, "ko");
}

function composeTitle(
  sourcingKeyword: string,
  keywords: string[],
  primaryKeyword?: string,
  alternateKeyword?: string,
) {
  const unique = uniqueKeywords(keywords);
  if (!unique.length) {
    return emptyComposedTitle();
  }

  const sourceNormalized = normalizeKeyword(sourcingKeyword);
  const base =
    unique.find((keyword) => normalizeKeyword(keyword) === sourceNormalized) ??
    (sourceNormalized &&
    unique.some(
      (keyword) => connectedTitlePart(sourcingKeyword, keyword) !== null,
    )
      ? sourcingKeyword.trim()
      : [...unique].sort(
          (left, right) => normalizeKeyword(left).length - normalizeKeyword(right).length,
        )[0]);
  const cleanedBase = cleanTitlePart(base);
  const baseNormalized = normalizeKeyword(cleanedBase.value);
  const modifiers: string[] = [];
  const modifierSources: Array<{
    modifier: string;
    keyword: string;
    productType: string;
  }> = [];
  const baseSourceKeyword =
    unique.find(
      (keyword) => normalizeKeyword(keyword) === normalizeKeyword(base),
    ) ?? null;
  const removedPromotionalTerms = [...cleanedBase.removedPromotionalTerms];
  const removedGenericTerms = [...cleanedBase.removedGenericTerms];
  const excludedUnrelatedKeywords: string[] = [];

  if (!baseNormalized) {
    return {
      ...emptyComposedTitle(),
      removedPromotionalTerms,
      removedGenericTerms,
    };
  }

  for (const keyword of unique) {
    const cleanedKeyword = cleanTitlePart(keyword);
    removedPromotionalTerms.push(...cleanedKeyword.removedPromotionalTerms);
    removedGenericTerms.push(...cleanedKeyword.removedGenericTerms);
    const normalized = normalizeKeyword(cleanedKeyword.value);
    if (normalized === baseNormalized) continue;
    const connectedPart = connectedTitlePart(
      sourcingKeyword,
      cleanedKeyword.value,
    );
    if (connectedPart === null) {
      excludedUnrelatedKeywords.push(keyword);
      continue;
    }
    const cleanedRemainder = cleanTitlePart(connectedPart.modifier);
    removedPromotionalTerms.push(...cleanedRemainder.removedPromotionalTerms);
    removedGenericTerms.push(...cleanedRemainder.removedGenericTerms);
    const remainder = cleanedRemainder.value;
    const formattedRemainder = formatTitleModifier(remainder);
    if (
      formattedRemainder &&
      !modifiers.some(
        (item) =>
          normalizeKeyword(item) === normalizeKeyword(formattedRemainder),
      )
    ) {
      modifiers.push(formattedRemainder);
      modifierSources.push({
        modifier: formattedRemainder,
        keyword,
        productType: connectedPart.productType,
      });
    }
  }

  const primarySource =
    modifierSources.find((source) => source.keyword === primaryKeyword) ??
    modifierSources[0];
  const alternateSource =
    modifierSources.find((source) => source.keyword === alternateKeyword) ??
    [...modifierSources].reverse().find(
      (source) =>
        source.keyword !== primarySource?.keyword &&
        normalizeKeyword(source.productType) !== normalizeKeyword(cleanedBase.value),
    );

  return {
    base: cleanedBase.value,
    modifiers,
    modifierSources,
    primaryModifier: primarySource?.modifier,
    alternateAnchor: alternateSource
      ? {
          modifier: alternateSource.modifier,
          productType: alternateSource.productType,
        }
      : null,
    baseSourceKeyword,
    removedPromotionalTerms: uniqueKeywords(removedPromotionalTerms),
    removedGenericTerms: uniqueKeywords(removedGenericTerms),
    excludedUnrelatedKeywords: uniqueKeywords(excludedUnrelatedKeywords),
  };
}

function connectedTitlePart(
  sourcingKeyword: string,
  candidateKeyword: string,
): { modifier: string; productType: string } | null {
  const source = normalizeKeyword(sourcingKeyword);
  const candidate = normalizeKeyword(candidateKeyword);
  if (!source || !candidate) return null;
  if (candidate.includes(source)) {
    return {
      modifier: candidate.replace(source, ""),
      productType: sourcingKeyword.trim(),
    };
  }

  if (source === "욕실화") {
    for (const alias of ["욕실슬리퍼", "화장실슬리퍼", "욕실신발"]) {
      if (candidate.includes(alias)) {
        return {
          modifier: candidate.replace(alias, ""),
          productType: alias,
        };
      }
    }
    const splitAlias = candidate.match(
      /^(욕실|화장실)(.+?)(슬리퍼|신발)$/,
    );
    if (splitAlias?.[2]) {
      return {
        modifier: splitAlias[2],
        productType: `${splitAlias[1]}${splitAlias[3]}`,
      };
    }
  }

  return null;
}

function uniqueKeywords(keywords: string[]) {
  const seen = new Set<string>();
  return keywords.filter((keyword) => {
    const normalized = normalizeKeyword(keyword);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function normalizeKeyword(keyword: string) {
  return keyword
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ko-KR");
}

function cleanTitlePart(value: string) {
  let normalized = normalizeKeyword(value);
  const removedPromotionalTerms = PROMOTIONAL_TERMS.filter((term) =>
    normalized.includes(normalizeKeyword(term)),
  );
  for (const term of removedPromotionalTerms) {
    normalized = normalized.replaceAll(normalizeKeyword(term), "");
  }
  const removedGenericTerms = GENERIC_PRODUCT_TERMS.filter(
    (term) => normalized === normalizeKeyword(term),
  );
  if (removedGenericTerms.length) normalized = "";
  return {
    value: normalized,
    removedPromotionalTerms: [...removedPromotionalTerms],
    removedGenericTerms: [...removedGenericTerms],
  };
}

function formatTitleModifier(value: string) {
  return normalizeKeyword(value)
    .replaceAll("문에안걸리는", "문에 안 걸리는")
    .replaceAll("발등낮은", "발등 낮은")
    .replaceAll("발등높은", "발등 높은")
    .replaceAll("낮은굽", "낮은 굽")
    .replaceAll("낮은높이", "낮은 높이")
    .replaceAll("빠른건조", "빠른 건조")
    .replaceAll("안미끄러운", "안 미끄러운")
    .replaceAll("물때안끼는", "물때 안 끼는")
    .replaceAll("eva", "EVA")
    .trim();
}

function emptyComposedTitle() {
  return {
    base: "",
    modifiers: [] as string[],
    modifierSources: [] as Array<{
      modifier: string;
      keyword: string;
      productType: string;
    }>,
    primaryModifier: undefined as string | undefined,
    alternateAnchor: null as {
      modifier: string;
      productType: string;
    } | null,
    baseSourceKeyword: null as string | null,
    removedPromotionalTerms: [] as string[],
    removedGenericTerms: [] as string[],
    excludedUnrelatedKeywords: [] as string[],
  };
}

function composeWithinLimit(
  base: string,
  modifiers: string[],
  limit: number,
  layout: {
    primaryModifier?: string;
    alternateModifier?: string;
    alternateProductType?: string;
  } = {},
) {
  const safeBase = base.trim().slice(0, limit);
  const canUseAlternateAnchor =
    Boolean(
      layout.primaryModifier &&
        layout.alternateModifier &&
        layout.alternateProductType,
    ) &&
    [
      layout.primaryModifier,
      safeBase,
      layout.alternateModifier,
      layout.alternateProductType,
    ]
      .filter(Boolean)
      .join(" ").length <= limit;
  const canUseSecondaryBase =
    canUseAlternateAnchor && modifiers.length >= 6;
  const fixedProductTypes = canUseAlternateAnchor
    ? [
        safeBase,
        ...(canUseSecondaryBase ? [safeBase] : []),
        layout.alternateProductType!,
      ]
    : [safeBase];
  const fixedLength = fixedProductTypes.join(" ").length;
  const capacity = Math.max(0, limit - fixedLength);
  const requiredModifiers = [
    layout.primaryModifier,
    canUseAlternateAnchor ? layout.alternateModifier : undefined,
  ].filter(
    (modifier, index, values): modifier is string =>
      Boolean(modifier) && values.indexOf(modifier) === index,
  );
  const requiredWeight = requiredModifiers.reduce(
    (length, modifier) => length + modifier.length + 1,
    0,
  );
  const fixedRequiredModifiers =
    requiredWeight <= capacity ? requiredModifiers : [];
  const optionalCapacity = capacity - Math.min(requiredWeight, capacity);
  let states = new Map<number, string[]>([[0, []]]);

  for (const modifier of modifiers.filter(
    (candidate) => !fixedRequiredModifiers.includes(candidate),
  )) {
    const weight = modifier.length + 1;
    const nextStates = new Map(states);
    for (const [usedLength, selected] of states) {
      const nextLength = usedLength + weight;
      if (nextLength > optionalCapacity) continue;
      const existing = nextStates.get(nextLength);
      const candidate = [...selected, modifier];
      if (
        !existing ||
        candidate.length > existing.length ||
        compareModifierPriority(candidate, existing, modifiers) < 0
      ) {
        nextStates.set(nextLength, candidate);
      }
    }
    states = nextStates;
  }

  const optionalModifiers =
    [...states.entries()]
      .sort(
        ([leftLength, left], [rightLength, right]) =>
          rightLength - leftLength ||
          right.length - left.length ||
          compareModifierPriority(left, right, modifiers),
      )[0]?.[1] ?? [];
  const selectedSet = new Set([
    ...fixedRequiredModifiers,
    ...optionalModifiers,
  ]);
  const selectedModifiers = modifiers.filter((modifier) =>
    selectedSet.has(modifier),
  );

  const middleModifiers = selectedModifiers.filter(
    (modifier) =>
      modifier !== layout.primaryModifier &&
      modifier !== layout.alternateModifier,
  );
  const middleGroups =
    canUseSecondaryBase && middleModifiers.length >= 2
      ? splitModifiersByReadingLength(middleModifiers)
      : [middleModifiers, []];
  const title = canUseAlternateAnchor
    ? canUseSecondaryBase && middleGroups[1]!.length
      ? [
          layout.primaryModifier!,
          safeBase,
          ...middleGroups[0]!,
          safeBase,
          ...middleGroups[1]!,
          layout.alternateModifier!,
          layout.alternateProductType!,
        ].join(" ")
      : [
          layout.primaryModifier!,
          safeBase,
          ...middleModifiers,
          layout.alternateModifier!,
          layout.alternateProductType!,
        ].join(" ")
    : [...selectedModifiers, safeBase].filter(Boolean).join(" ");

  return {
    title,
    selectedModifiers,
  };
}

function splitModifiersByReadingLength(modifiers: string[]) {
  let bestIndex = 1;
  let smallestDifference = Number.POSITIVE_INFINITY;

  for (let index = 1; index < modifiers.length; index += 1) {
    const leftLength = modifiers.slice(0, index).join(" ").length;
    const rightLength = modifiers.slice(index).join(" ").length;
    const difference = Math.abs(leftLength - rightLength);
    if (difference < smallestDifference) {
      bestIndex = index;
      smallestDifference = difference;
    }
  }

  return [modifiers.slice(0, bestIndex), modifiers.slice(bestIndex)] as const;
}

function compareModifierPriority(
  left: string[],
  right: string[],
  priorities: string[],
) {
  for (const modifier of priorities) {
    const difference =
      Number(right.includes(modifier)) - Number(left.includes(modifier));
    if (difference) return difference;
  }
  return 0;
}
