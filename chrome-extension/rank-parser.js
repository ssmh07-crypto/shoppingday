(() => {
  const PRODUCT_LINK_PATTERN =
    /\/(?:products|catalog)\/\d+|[?&](?:nvMid|productId|productNo)=\d+/i;

  function collectShoppingCandidates(root, target) {
    const targetUrl = new URL(target.smartstoreUrl);
    const targetPath = targetUrl.pathname.replace(/\/+$/, "");
    const seenCards = new Set();
    const seenIdentities = new Set();
    const candidates = [];

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
        .map((item) =>
          decodeHref(item.href || item.getAttribute("href") || ""),
        )
        .filter((item) => PRODUCT_LINK_PATTERN.test(item));
      const dataIdentity =
        card.getAttribute("data-shp-contents-id") ??
        card.getAttribute("data-product-id") ??
        "";
      const identity = candidateIdentity(dataIdentity || links[0] || href);
      if (!identity || seenIdentities.has(identity)) continue;
      seenIdentities.add(identity);

      const searchable = [
        dataIdentity,
        ...links,
        ...Array.from(card.attributes).map((item) => item.value),
      ]
        .join(" ")
        .toLocaleLowerCase("ko-KR");
      candidates.push({
        identity,
        targetMatched:
          searchable.includes(target.channelProductNo) ||
          searchable.includes(targetPath.toLocaleLowerCase("ko-KR")),
      });
    }
    return candidates;
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

  globalThis.ShoppingdayRankParser = { collectShoppingCandidates };
})();
