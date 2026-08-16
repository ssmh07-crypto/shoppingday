(() => {
  const PRODUCT_LINK_PATTERN =
    /\/(?:products|catalog)\/\d+|[?&](?:nvMid|productId|productNo)=\d+/i;

  function collectShoppingCandidates(root, target) {
    const targetUrl = new URL(target.smartstoreUrl);
    const targetPath = targetUrl.pathname.replace(/\/+$/, "");
    return collectProductCards(root).map(({ card, identity, links, dataIdentity }) => {
      const searchable = [
        dataIdentity,
        ...links,
        ...Array.from(card.attributes).map((item) => item.value),
      ]
        .join(" ")
        .toLocaleLowerCase("ko-KR");
      return {
        identity,
        targetMatched:
          searchable.includes(target.channelProductNo) ||
          searchable.includes(targetPath.toLocaleLowerCase("ko-KR")),
      };
    });
  }

  function collectShoppingKeywordExposure(root, keyword) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) return [];

    return collectProductCards(root).map(({ card, identity }) => {
      const title = findProductTitle(card);
      const categoryText = collectAreaText(
        card,
        "[class*='category'], [data-testid*='category'], [data-shp-area-id*='category']",
      );
      const explicitAttributeText = collectAreaText(
        card,
        "[class*='spec'], [class*='attribute'], [class*='option'], [class*='detail'], [data-testid*='spec'], [data-testid*='attribute']",
      );
      const cardText = visibleText(card);
      const titleMatch = matchTitleKeyword(title, normalizedKeyword);
      const titleMatched = titleMatch.matched;
      const categoryMatched = includesKeyword(categoryText, normalizedKeyword);
      const explicitAttributeMatched = includesKeyword(
        explicitAttributeText,
        normalizedKeyword,
      );
      const remainingText = removeFirst(removeFirst(cardText, title), categoryText);
      const attributeMatched =
        explicitAttributeMatched ||
        (!titleMatched &&
          !categoryMatched &&
          includesKeyword(remainingText, normalizedKeyword));
      const matchedIn = [];
      if (titleMatched) matchedIn.push("product_name");
      if (attributeMatched) matchedIn.push("attribute");
      if (categoryMatched) matchedIn.push("category");

      return {
        identity,
        title: title.slice(0, 200),
        titleMatched,
        titleMatchType: titleMatch.type,
        titleMatchSegments: titleMatch.segments,
        attributeMatched,
        categoryMatched,
        matchedIn,
        evidence: matchingEvidence(
          normalizedKeyword,
          title,
          explicitAttributeText || remainingText,
          categoryText,
          titleMatch,
        ),
      };
    });
  }

  function collectProductCards(root) {
    const seenCards = new Set();
    const seenIdentities = new Set();
    const cards = [];
    for (const anchor of Array.from(root.querySelectorAll("a[href]"))) {
      const rawHref = anchor.getAttribute("href") ?? "";
      const href = decodeHref(anchor.href || rawHref);
      if (!PRODUCT_LINK_PATTERN.test(href)) continue;
      const card =
        anchor.closest(
          "li, article, [data-shp-contents-id], [class*='product_item'], [class*='productCard'], [class*='product_card']",
        ) ?? anchor;
      if (seenCards.has(card) || isAdvertisement(card)) continue;
      seenCards.add(card);
      const links = Array.from(card.querySelectorAll("a[href]"))
        .map((item) => decodeHref(item.href || item.getAttribute("href") || ""))
        .filter((item) => PRODUCT_LINK_PATTERN.test(item));
      const dataIdentity =
        card.getAttribute("data-shp-contents-id") ??
        card.getAttribute("data-product-id") ??
        "";
      const identity = candidateIdentity(dataIdentity || links[0] || href);
      if (!identity || seenIdentities.has(identity)) continue;
      seenIdentities.add(identity);
      cards.push({ card, identity, links, dataIdentity });
    }
    return cards;
  }

  function findProductTitle(card) {
    const candidates = Array.from(
      card.querySelectorAll(
        "a[href], [class*='title'], [class*='name'], [data-testid*='title'], [data-testid*='name']",
      ),
    )
      .flatMap((element) => {
        const marker = [
          element.className ?? "",
          element.getAttribute("data-testid") ?? "",
          element.getAttribute("data-shp-contents-dtl") ?? "",
        ].join(" ");
        const href =
          element instanceof HTMLAnchorElement
            ? decodeHref(element.href || element.getAttribute("href") || "")
            : "";
        const productHrefHint = PRODUCT_LINK_PATTERN.test(href) ? 300 : 0;
        const titleHint = /title|name|product[_-]?link/i.test(marker) ? 1000 : 0;
        const values = [
          visibleText(element),
          element.getAttribute("title") ?? "",
          element.getAttribute("aria-label") ?? "",
          element.querySelector("img")?.getAttribute("alt") ?? "",
        ]
          .map((value) => value.normalize("NFKC").replace(/\s+/g, " ").trim())
          .filter(isMeaningfulTitle);
        return values.map((text) => ({
          text,
          score: titleHint + productHrefHint + text.length,
        }));
      });
    candidates.sort((left, right) => right.score - left.score);
    return candidates[0]?.text ?? "";
  }

  function isMeaningfulTitle(value) {
    return (
      value.length >= 2 &&
      !/^(이미지|상품 이미지|찜하기|비교하기|새창|바로가기)$/i.test(value)
    );
  }

  function collectAreaText(card, selector) {
    return Array.from(card.querySelectorAll(selector))
      .map(visibleText)
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(" ");
  }

  function visibleText(element) {
    return (element.innerText || element.textContent || "")
      .normalize("NFKC")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .replace(/\s+/g, "")
      .toLocaleLowerCase("ko-KR");
  }

  function includesKeyword(value, normalizedKeyword) {
    return normalizeText(value).includes(normalizedKeyword);
  }

  function matchTitleKeyword(value, normalizedKeyword) {
    const normalizedTitle = normalizeText(value);
    if (normalizedTitle.includes(normalizedKeyword)) {
      return { matched: true, type: "exact", segments: [normalizedKeyword] };
    }
    const segments = findCompoundSegments(normalizedKeyword, normalizedTitle);
    return segments
      ? { matched: true, type: "compound", segments }
      : { matched: false, type: "none", segments: [] };
  }

  function findCompoundSegments(keyword, title) {
    if (keyword.length < 4 || title.length < 2) return null;
    const paths = Array(keyword.length + 1).fill(null);
    paths[0] = [];
    for (let start = 0; start < keyword.length; start += 1) {
      const path = paths[start];
      if (!path) continue;
      for (let end = start + 2; end <= keyword.length; end += 1) {
        if (start === 0 && end === keyword.length) continue;
        const fragment = keyword.slice(start, end);
        if (!title.includes(fragment)) continue;
        const candidate = [...path, fragment];
        const existing = paths[end];
        if (!existing || candidate.length < existing.length) {
          paths[end] = candidate;
        }
      }
    }
    const segments = paths[keyword.length];
    return segments?.length >= 2 ? segments : null;
  }

  function removeFirst(value, removed) {
    return removed ? value.replace(removed, " ") : value;
  }

  function matchingEvidence(
    keyword,
    title,
    attributeText,
    categoryText,
    titleMatch,
  ) {
    if (titleMatch.matched) {
      const prefix =
        titleMatch.type === "compound"
          ? `[조합: ${titleMatch.segments.join(" + ")}] `
          : "";
      return `${prefix}${title}`.slice(0, 240);
    }
    for (const value of [attributeText, categoryText]) {
      if (includesKeyword(value, keyword)) return value.slice(0, 240);
    }
    return "";
  }

  function isAdvertisement(card) {
    const text = (card.textContent ?? "").replace(/\s+/g, " ").trim();
    const areaId = card.getAttribute("data-shp-area-id") ?? "";
    return (
      /(^|\s)광고(\s|$)/.test(text) ||
      /(^|[_-])ad([_-]|$)/i.test(areaId)
    );
  }

  function decodeHref(value) {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  function candidateIdentity(value) {
    try {
      const url = new URL(value, "https://search.shopping.naver.com");
      for (const key of [...url.searchParams.keys()]) {
        if (!["nvMid", "productId", "productNo"].includes(key)) {
          url.searchParams.delete(key);
        }
      }
      return `${url.hostname}${url.pathname}${url.search}`;
    } catch {
      return value.trim();
    }
  }

  globalThis.ShoppingdayRankParser = {
    collectShoppingCandidates,
    collectShoppingKeywordExposure,
  };
})();
