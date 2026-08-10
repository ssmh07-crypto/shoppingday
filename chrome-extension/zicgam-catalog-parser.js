(() => {
  const PRODUCT_PATH = "/product/detail.html";

  function discoverPage(root, baseUrl) {
    const inspected = inspectCatalogPage(root, baseUrl);
    return {
      productUrls: inspected.productUrls,
      listUrls: inspected.paginationUrls,
    };
  }

  function inspectCatalogPage(root, baseUrl) {
    const productUrls = new Map();
    const currentUrl = new URL(baseUrl);
    const canonicalCurrentUrl = canonicalListUrl(currentUrl);
    if (!canonicalCurrentUrl) {
      throw new Error("직감 전체상품 목록 주소를 확인하지 못했습니다.");
    }
    const currentPage = pageNumber(new URL(canonicalCurrentUrl));
    const normalListAnchors = root.querySelectorAll(
      ".xans-product-listnormal .prdList a[href]",
    );
    const productAnchors = normalListAnchors.length
      ? normalListAnchors
      : root.querySelectorAll(".prdList a[href]");
    for (const anchor of productAnchors) {
      const href = anchor.getAttribute("href");
      const url = safeUrl(href, baseUrl);
      if (!url || url.hostname !== "zicgam.com") continue;
      const productId = productNo(url);
      if (productId) {
        productUrls.set(productId, canonicalProductUrl(url, productId));
      }
    }
    const paginationUrls = new Map();
    for (const anchor of root.querySelectorAll(
      ".xans-product-normalpaging a[href], .ec-base-paginate a[href]",
    )) {
      const href = anchor.getAttribute("href");
      const url = safeUrl(href, baseUrl);
      if (!url || url.hostname !== "zicgam.com") continue;
      inheritCatalogParameters(url, currentUrl);
      const listUrl = canonicalListUrl(url);
      if (!listUrl || !sameCatalog(new URL(listUrl), currentUrl)) continue;
      paginationUrls.set(pageNumber(new URL(listUrl)), listUrl);
    }
    const activePage = activePageNumber(root);
    const nextListUrl = paginationUrls.get(currentPage + 1) ?? null;
    return {
      productUrls: [...productUrls.values()],
      paginationUrls: [...paginationUrls.values()],
      currentPage,
      activePage,
      nextListUrl,
      displayedTotal: displayedProductTotal(root),
    };
  }

  function findAllProductsListUrl(root, baseUrl) {
    for (const anchor of root.querySelectorAll("a[href]")) {
      const label = normalizeText(
        `${anchor.textContent ?? ""} ${anchor.getAttribute("title") ?? ""} ${anchor.querySelector("img")?.getAttribute("alt") ?? ""}`,
      );
      if (!/^(전체\s*(?:상품|보기)|ALL(?:\s*PRODUCTS?)?)$/i.test(label)) {
        continue;
      }
      const url = safeUrl(anchor.getAttribute("href"), baseUrl);
      if (!url || url.hostname !== "zicgam.com") continue;
      const listUrl = canonicalListUrl(url);
      if (listUrl) return listUrl;
    }
    return null;
  }

  function extractProduct(root, pageUrl, stockParser) {
    const url = new URL(pageUrl);
    const externalProductId = productNo(url);
    if (!externalProductId) throw new Error("직감 상품번호를 찾지 못했습니다.");

    const stock = stockParser.inspect(root, url, pageUrl);
    if (stock.status === "auth_required") {
      const error = new Error("직감 로그인 또는 승인회원 확인이 필요합니다.");
      error.code = "auth_required";
      throw error;
    }

    const originalName = firstText([
      root.querySelector("meta[property='og:title']")?.getAttribute("content"),
      root.querySelector(".headingArea h2, .infoArea h2")?.textContent,
      root.querySelector("meta[name='twitter:title']")?.getAttribute("content"),
      root.title,
    ]).replace(/\s*[-|]\s*(직감|위탁배송 쇼핑몰).*$/i, "").trim();
    if (!originalName) throw new Error("직감 상품명을 찾지 못했습니다.");

    const supplierPrice = firstPrice([
      root.querySelector("meta[property='product:price:amount']")?.getAttribute("content"),
      root.querySelector("#product_price")?.getAttribute("value"),
      root.querySelector("input[name='product_price']")?.getAttribute("value"),
      root.querySelector("#span_product_price_text")?.textContent,
      root.querySelector("#span_product_price_sale")?.textContent,
      root.querySelector(".xans-product-detail .price")?.textContent,
    ]);
    const images = extractImages(root, pageUrl);
    const options = extractOptions(root);
    const description = extractDescription(root, pageUrl);
    return {
      externalProductId,
      url: canonicalProductUrl(url, externalProductId),
      originalName: originalName.slice(0, 200),
      supplierPrice,
      availability:
        stock.status === "available" || stock.status === "partial_sold_out"
          ? "active"
          : stock.status === "sold_out" || stock.status === "discontinued"
            ? "sold_out"
            : "unknown",
      images,
      options,
      rawDescription: description,
      capturedAt: new Date().toISOString(),
      evidence: stock.evidence,
    };
  }

  function extractImages(root, baseUrl) {
    const urls = [];
    const candidates = [
      root.querySelector("meta[property='og:image']")?.getAttribute("content"),
      ...Array.from(
        root.querySelectorAll(
          ".keyImg img, .xans-product-addimage img, #prdDetail img, .cont img, .detailArea img",
        ),
        (image) =>
          image.getAttribute("ec-data-src") ??
          image.getAttribute("data-src") ??
          image.getAttribute("src"),
      ),
    ];
    for (const candidate of candidates) {
      const url = safeUrl(candidate, baseUrl);
      if (!url || !["http:", "https:"].includes(url.protocol)) continue;
      if (/\.(svg|gif)(?:\?|$)/i.test(url.pathname)) continue;
      const value = url.toString();
      if (!urls.includes(value)) urls.push(value);
    }
    return urls.slice(0, 100);
  }

  function extractOptions(root) {
    const options = [];
    for (const select of root.querySelectorAll(
      ".xans-product-option select, select[id*='product_option_id']",
    )) {
      const group = normalizeText(
        select.closest("tr, li, .ec-product-option")?.querySelector("th, .name, label")
          ?.textContent ?? select.getAttribute("option_title") ?? "옵션",
      );
      for (const option of select.querySelectorAll("option")) {
        const value = option.getAttribute("value") ?? "";
        const label = normalizeText(option.textContent ?? "");
        if (!label || !value || value === "*" || value === "**") continue;
        const cleanLabel = label.replace(/\s*\[(?:품절|SOLD OUT)\]\s*/gi, " ").trim();
        const name = group && group !== "옵션" ? `${group}: ${cleanLabel}` : cleanLabel;
        const price = firstPrice([
          option.getAttribute("data-product-option-price"),
          option.getAttribute("data-option-price"),
          priceSuffix(label),
        ]);
        if (!options.some((item) => item.name === name)) {
          options.push({ name: name.slice(0, 100), price });
        }
      }
    }
    return options.slice(0, 500);
  }

  function extractDescription(root, baseUrl) {
    const source = root.querySelector("#prdDetail, .xans-product-additional .cont");
    if (!source) return null;
    const clone = source.cloneNode(true);
    for (const element of clone.querySelectorAll(
      "img[src], img[data-src], img[ec-data-src]",
    )) {
      const raw =
        element.getAttribute("ec-data-src") ??
        element.getAttribute("data-src") ??
        element.getAttribute("src");
      const url = safeUrl(raw, baseUrl);
      if (url) element.setAttribute("src", url.toString());
      element.removeAttribute("ec-data-src");
      element.removeAttribute("data-src");
      element.removeAttribute("srcset");
    }
    for (const anchor of clone.querySelectorAll("a[href]")) {
      const url = safeUrl(anchor.getAttribute("href"), baseUrl);
      if (url) anchor.setAttribute("href", url.toString());
    }
    return clone.innerHTML.slice(0, 200_000) || null;
  }

  function productNo(url) {
    const queryValue = url.searchParams.get("product_no");
    if (/^\d+$/.test(queryValue ?? "")) return queryValue;
    const pretty = url.pathname.match(/\/product\/[^/]+\/(\d+)(?:\/|$)/);
    return pretty?.[1] ?? null;
  }

  function canonicalProductUrl(url, id) {
    const result = new URL(PRODUCT_PATH, "https://zicgam.com");
    result.searchParams.set("product_no", id);
    for (const key of ["cate_no", "display_group"]) {
      const value = url.searchParams.get(key);
      if (/^\d+$/.test(value ?? "")) result.searchParams.set(key, value);
    }
    return result.toString();
  }

  function canonicalListUrl(url) {
    const standard = url.pathname === "/product/list.html";
    const pretty = url.pathname.startsWith("/category/");
    if (!standard && !pretty) return null;
    const result = new URL(pretty ? url.pathname : "/product/list.html", url.origin);
    for (const key of ["cate_no", "display_group", "page"]) {
      const value = url.searchParams.get(key);
      if (/^\d+$/.test(value ?? "")) result.searchParams.set(key, value);
    }
    if (standard && !result.searchParams.has("cate_no")) return null;
    return result.toString();
  }

  function inheritCatalogParameters(url, currentUrl) {
    for (const key of ["cate_no", "display_group"]) {
      if (!url.searchParams.has(key) && currentUrl.searchParams.has(key)) {
        url.searchParams.set(key, currentUrl.searchParams.get(key));
      }
    }
  }

  function sameCatalog(left, right) {
    if (left.pathname !== right.pathname) return false;
    if (left.pathname === "/product/list.html") {
      return (
        left.searchParams.get("cate_no") === right.searchParams.get("cate_no") &&
        (left.searchParams.get("display_group") ?? "") ===
          (right.searchParams.get("display_group") ?? "")
      );
    }
    return left.pathname.startsWith("/category/");
  }

  function pageNumber(url) {
    const value = Number(url.searchParams.get("page") ?? "1");
    return Number.isInteger(value) && value > 0 ? value : 1;
  }

  function catalogPageUrl(baseUrl, page) {
    if (!Number.isInteger(page) || page < 1) return null;
    const canonical = canonicalListUrl(new URL(baseUrl));
    if (!canonical) return null;
    const result = new URL(canonical);
    result.searchParams.set("page", String(page));
    return result.toString();
  }

  function activePageNumber(root) {
    for (const element of root.querySelectorAll(
      ".xans-product-normalpaging .this, .xans-product-normalpaging .selected, .xans-product-normalpaging .active, .xans-product-normalpaging [aria-current='page'], .xans-product-normalpaging strong, .ec-base-paginate .this, .ec-base-paginate .selected, .ec-base-paginate .active, .ec-base-paginate [aria-current='page'], .ec-base-paginate strong",
    )) {
      const text = normalizeText(element.textContent ?? "").replace(/,/g, "");
      if (/^\d+$/.test(text)) return Number(text);
    }
    return null;
  }

  function displayedProductTotal(root) {
    for (const element of root.querySelectorAll(
      "[data-total-count], .xans-product-normalmenu .prdCount, .xans-product-normalmenu .count, .prdCount",
    )) {
      const attribute = element.getAttribute("data-total-count");
      const text = normalizeText(attribute ?? element.textContent ?? "");
      const matched =
        text.match(/(?:TOTAL|총)\s*:?[\s]*(\d[\d,]*)/i) ??
        text.match(/(\d[\d,]*)\s*(?:items?|개)/i);
      if (!matched) continue;
      const value = Number(matched[1].replace(/,/g, ""));
      if (Number.isInteger(value) && value >= 0) return value;
    }
    return null;
  }

  function firstText(values) {
    return normalizeText(values.find((value) => normalizeText(value ?? "")) ?? "");
  }

  function firstPrice(values) {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const matched = String(value).replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
      if (!matched) continue;
      const number = Number(matched[0]);
      if (Number.isFinite(number)) return Math.round(number);
    }
    return null;
  }

  function priceSuffix(value) {
    return value.match(/\(([+-]?[\d,]+)\s*원?\)/)?.[1] ?? null;
  }

  function safeUrl(value, baseUrl) {
    if (!value || /^javascript:/i.test(value)) return null;
    try {
      return new URL(value, baseUrl);
    } catch {
      return null;
    }
  }

  function normalizeText(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  globalThis.ShoppingdayZicgamCatalogParser = {
    discoverPage,
    inspectCatalogPage,
    findAllProductsListUrl,
    extractProduct,
    productNo,
    catalogPageUrl,
  };
})();
