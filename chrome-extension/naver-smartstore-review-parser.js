(function attachShoppingdaySmartstoreReviewParser(root) {
  const REVIEW_ROOT_SELECTORS = [
    "#REVIEW",
    "[id*='REVIEW']",
    "[data-shp-area-id*='review' i]",
    "[class*='review_section' i]",
    "[class*='reviewArea' i]",
  ];
  const REVIEW_CARD_SELECTORS = [
    "[data-review-id]",
    "li",
    "article",
    "[role='listitem']",
  ];
  const CONTENT_SELECTORS = [
    "[data-review-content]",
    "[class*='review_text' i]",
    "[class*='reviewText' i]",
    "[class*='review_content' i]",
    "[class*='reviewContent' i]",
    "p",
  ];

  function collectVisibleReviews(documentRoot) {
    const roots = reviewRoots(documentRoot);
    const candidates = roots.flatMap((reviewRoot) =>
      REVIEW_CARD_SELECTORS.flatMap((selector) =>
        Array.from(reviewRoot.querySelectorAll(selector)),
      ),
    );
    const uniqueCandidates = Array.from(new Set(candidates))
      .filter((element) => isVisible(element) && isReviewCard(element));
    const leafCards = uniqueCandidates.filter((candidate) =>
      !uniqueCandidates.some(
        (other) => other !== candidate && candidate.contains(other),
      ),
    );
    const seen = new Set();
    return leafCards.flatMap((card) => {
      const content = reviewContent(card);
      const key = normalize(content).toLocaleLowerCase("ko-KR");
      if (!key || seen.has(key)) return [];
      seen.add(key);
      return [{ content, rating: reviewRating(card) }];
    });
  }

  function reviewRoots(documentRoot) {
    const roots = REVIEW_ROOT_SELECTORS.flatMap((selector) =>
      Array.from(documentRoot.querySelectorAll(selector)),
    ).filter((element) => normalize(element.textContent).length > 0);
    return roots.length ? Array.from(new Set(roots)) : [documentRoot];
  }

  function isVisible(element) {
    for (let current = element; current; current = current.parentElement) {
      if (current.hidden || current.getAttribute("aria-hidden") === "true") {
        return false;
      }
      const inlineStyle = current.getAttribute("style") ?? "";
      if (/display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse)/i.test(inlineStyle)) {
        return false;
      }
      const view = current.ownerDocument?.defaultView;
      if (view?.getComputedStyle) {
        const computed = view.getComputedStyle(current);
        if (
          computed.display === "none" ||
          computed.visibility === "hidden" ||
          computed.visibility === "collapse"
        ) {
          return false;
        }
      }
    }
    return true;
  }

  function isReviewCard(element) {
    const text = normalize(element.textContent);
    if (text.length < 4 || text.length > 3_000) return false;
    if (/리뷰가\s*없|작성된\s*리뷰|리뷰\s*작성/i.test(text)) return false;
    return Boolean(
      element.hasAttribute("data-review-id") ||
      reviewRating(element) !== null ||
      /\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}|재구매|한달사용|구매자|구매옵션|옵션/i.test(text),
    );
  }

  function reviewContent(card) {
    const explicit = CONTENT_SELECTORS.flatMap((selector) =>
      Array.from(card.querySelectorAll(selector)),
    )
      .map((element) => normalize(element.textContent))
      .filter(isPlausibleContent)
      .sort((left, right) => right.length - left.length)[0];
    if (explicit) return explicit.slice(0, 10_000);

    const lines = (card.innerText || card.textContent || "")
      .split(/\n+/)
      .map(normalize)
      .filter(isPlausibleContent)
      .sort((left, right) => right.length - left.length);
    return (lines[0] ?? "").slice(0, 10_000);
  }

  function isPlausibleContent(value) {
    if (value.length < 2 || value.length > 2_000) return false;
    return !/^(평점|별점)?\s*[1-5](?:\.0)?\s*점?$|^\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}$|^(재구매|한달사용|구매자|신고|도움돼요|내용 더보기|접기)$/i.test(value) &&
      !/^(옵션|구매옵션)\s*[:：]/i.test(value);
  }

  function reviewRating(card) {
    const evidenceElements = [
      card,
      ...Array.from(card.querySelectorAll(
        "[aria-label], [title], [alt], [data-rating], [data-score], [data-star-rating]",
      )),
    ];
    for (const element of evidenceElements) {
      for (const attribute of ["data-rating", "data-score", "data-star-rating"]) {
        const direct = validRating(element.getAttribute(attribute));
        if (direct !== null) return direct;
      }
      for (const attribute of ["aria-label", "title", "alt"]) {
        const rating = ratingFromText(element.getAttribute(attribute) ?? "", true);
        if (rating !== null) return rating;
      }
    }
    const textRating = ratingFromText(card.textContent ?? "", false);
    if (textRating !== null) return textRating;

    const meterElements = card.querySelectorAll(
      "[class*='star' i][style*='width' i], [class*='rating' i][style*='width' i]",
    );
    for (const element of meterElements) {
      const match = (element.getAttribute("style") ?? "").match(/width\s*:\s*(\d{1,3}(?:\.\d+)?)%/i);
      const percent = Number(match?.[1]);
      if (Number.isFinite(percent) && percent >= 20 && percent <= 100) {
        const rating = percent / 20;
        if (Number.isInteger(rating)) return rating;
      }
    }
    return null;
  }

  function ratingFromText(value, allowStandalone) {
    const text = normalize(value);
    if (!text) return null;
    const patterns = [
      /(?:5\s*점\s*만점(?:에|중)?|만점\s*5\s*점(?:에|중)?)\s*([1-5](?:\.0)?)\s*점?/i,
      /([1-5](?:\.0)?)\s*점?\s*(?:[/／]|중)\s*5\s*점?/i,
      /(?:평점|별점|rating|score)\s*[:：]?\s*([1-5](?:\.0)?)/i,
      ...(allowStandalone ? [/^\s*([1-5](?:\.0)?)\s*점?\s*$/i] : []),
    ];
    for (const pattern of patterns) {
      const rating = validRating(text.match(pattern)?.[1] ?? null);
      if (rating !== null) return rating;
    }
    return null;
  }

  function validRating(value) {
    if (!/^\s*[1-5](?:\.0)?\s*$/.test(String(value ?? ""))) return null;
    const rating = Number(value);
    return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
  }

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  const api = { collectVisibleReviews, reviewContent, reviewRating };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ShoppingdaySmartstoreReviewParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
