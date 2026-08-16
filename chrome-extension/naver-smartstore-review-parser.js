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
    if (element.hidden || element.getAttribute("aria-hidden") === "true") return false;
    const style = element.getAttribute("style") ?? "";
    return !/display\s*:\s*none|visibility\s*:\s*hidden/i.test(style);
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
    const evidence = [
      card.getAttribute("aria-label"),
      card.getAttribute("title"),
      ...Array.from(card.querySelectorAll("[aria-label], [title]")).flatMap((element) => [
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
      ]),
      card.textContent,
    ].filter(Boolean).join(" ");
    const match = evidence.match(/(?:평점|별점)\s*[:：]?\s*([1-5](?:\.0)?)|([1-5](?:\.0)?)\s*점/i);
    const rating = Number(match?.[1] ?? match?.[2]);
    return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
  }

  function normalize(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  const api = { collectVisibleReviews, reviewContent, reviewRating };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ShoppingdaySmartstoreReviewParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
