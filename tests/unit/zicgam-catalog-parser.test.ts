// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

type CatalogParser = {
  catalogPageUrl(baseUrl: string, page: number): string | null;
  findAllProductsListUrl(root: Document, baseUrl: string): string | null;
  inspectCatalogPage(
    root: Document,
    baseUrl: string,
  ): {
    productUrls: string[];
    paginationUrls: string[];
    currentPage: number;
    activePage: number | null;
    nextListUrl: string | null;
    displayedTotal: number | null;
  };
  discoverPage(
    root: Document,
    baseUrl: string,
  ): {
    productUrls: string[];
    listUrls: string[];
  };
  extractProduct(
    root: Document,
    pageUrl: string,
    stockParser: { inspect(): Record<string, unknown> },
  ): {
    externalProductId: string;
    originalName: string;
    supplierPrice: number | null;
    availability: string;
    images: string[];
    options: Array<{ name: string; price: number | null }>;
    rawDescription: string | null;
  };
};

const parserGlobal = globalThis as typeof globalThis & {
  ShoppingdayZicgamCatalogParser: CatalogParser;
};

beforeAll(async () => {
  // @ts-expect-error Chrome runtime script intentionally has no module typings.
  await import("../../chrome-extension/zicgam-catalog-parser.js");
});

beforeEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("Zicgam full catalog parser", () => {
  it("selects only the all-products catalog entry from the home navigation", () => {
    document.body.innerHTML = `
      <nav id="category">
        <a href="/product/list.html?cate_no=24">전체상품</a>
        <a href="/product/list.html?cate_no=48">욕실용품</a>
        <a href="/product/list.html?cate_no=77">품절상품</a>
      </nav>
    `;

    expect(
      parserGlobal.ShoppingdayZicgamCatalogParser.findAllProductsListUrl(
        document,
        "https://zicgam.com/index.html",
      ),
    ).toBe("https://zicgam.com/product/list.html?cate_no=24");
  });

  it("does not guess another category when an all-products link is absent", () => {
    document.body.innerHTML = `
      <nav id="category"><a href="/product/list.html?cate_no=48">욕실용품</a></nav>
    `;

    expect(
      parserGlobal.ShoppingdayZicgamCatalogParser.findAllProductsListUrl(
        document,
        "https://zicgam.com/index.html",
      ),
    ).toBeNull();
  });

  it("discovers and deduplicates category, pagination, and product links", () => {
    document.body.innerHTML = `
      <ul class="prdList">
        <li><a href="/product/detail.html?product_no=3649&cate_no=48">상품</a></li>
        <li><a href="/product/detail.html?product_no=3649&cate_no=48">중복 상품</a></li>
      </ul>
      <div class="ec-base-paginate">
        <a href="/product/list.html?cate_no=48">1</a>
        <a href="/product/list.html?cate_no=48&page=2&sort_method=5">2</a>
      </div>
      <aside><a href="/product/detail.html?product_no=9999">최근 본 상품</a></aside>
    `;

    const result = parserGlobal.ShoppingdayZicgamCatalogParser.discoverPage(
      document,
      "https://zicgam.com/product/list.html?cate_no=48",
    );

    expect(result.productUrls).toEqual([
      "https://zicgam.com/product/detail.html?product_no=3649&cate_no=48",
    ]);
    expect(result.listUrls).toEqual([
      "https://zicgam.com/product/list.html?cate_no=48",
      "https://zicgam.com/product/list.html?cate_no=48&page=2",
    ]);
  });

  it("ignores product links outside the catalog product list", () => {
    document.body.innerHTML = `
      <ul class="prdList"><li><a href="/product/detail.html?product_no=100">목록 상품</a></li></ul>
      <section class="recent"><a href="/product/detail.html?product_no=200">최근 본 상품</a></section>
      <section class="recommend"><a href="/product/detail.html?product_no=300">추천 상품</a></section>
    `;

    const result = parserGlobal.ShoppingdayZicgamCatalogParser.discoverPage(
      document,
      "https://zicgam.com/product/list.html?cate_no=48",
    );

    expect(result.productUrls).toEqual([
      "https://zicgam.com/product/detail.html?product_no=100",
    ]);
  });

  it("selects only the sequential next page in the same all-products catalog", () => {
    document.body.innerHTML = `
      <div class="xans-product-normalmenu"><p class="prdCount">TOTAL <strong>1,999</strong> items</p></div>
      <div class="xans-product-listnormal"><ul class="prdList">
        <li><a href="/product/detail.html?product_no=100&cate_no=56">상품 100</a></li>
        <li><a href="/product/detail.html?product_no=101&cate_no=56">상품 101</a></li>
      </ul></div>
      <div class="xans-product-normalpaging">
        <a class="this" href="?cate_no=56&page=1">1</a>
        <a href="?cate_no=56&page=2">2</a>
        <a href="?cate_no=59&page=2">다른 카테고리</a>
        <a href="?cate_no=56&page=11">다음 묶음</a>
      </div>
    `;

    const result =
      parserGlobal.ShoppingdayZicgamCatalogParser.inspectCatalogPage(
        document,
        "https://zicgam.com/product/list.html?cate_no=56",
      );

    expect(result).toMatchObject({
      currentPage: 1,
      activePage: 1,
      displayedTotal: 1999,
      nextListUrl: "https://zicgam.com/product/list.html?cate_no=56&page=2",
    });
    expect(result.paginationUrls).not.toContain(
      "https://zicgam.com/product/list.html?cate_no=59&page=2",
    );
  });

  it("recognizes the last page only when the active page has no sequential next link", () => {
    document.body.innerHTML = `
      <div class="xans-product-listnormal"><ul class="prdList">
        <li><a href="/product/detail.html?product_no=999&cate_no=56">마지막 상품</a></li>
      </ul></div>
      <div class="ec-base-paginate">
        <a href="?page=2">2</a>
        <strong>3</strong>
      </div>
    `;

    const result =
      parserGlobal.ShoppingdayZicgamCatalogParser.inspectCatalogPage(
        document,
        "https://zicgam.com/product/list.html?cate_no=56&page=3",
      );

    expect(result.currentPage).toBe(3);
    expect(result.activePage).toBe(3);
    expect(result.nextListUrl).toBeNull();
    expect(result.paginationUrls).toContain(
      "https://zicgam.com/product/list.html?cate_no=56&page=2",
    );
  });

  it("builds each numbered page directly and recognizes an empty page", () => {
    const parser = parserGlobal.ShoppingdayZicgamCatalogParser;
    const url = parser.catalogPageUrl(
      "https://zicgam.com/product/list.html?cate_no=56&sort_method=5",
      51,
    );

    expect(url).toBe("https://zicgam.com/product/list.html?cate_no=56&page=51");

    document.body.innerHTML =
      '<div class="xans-product-listnormal"><ul class="prdList"></ul></div>';
    const result = parser.inspectCatalogPage(document, url!);
    expect(result.currentPage).toBe(51);
    expect(result.productUrls).toEqual([]);
  });

  it("extracts normalized product fields from a Cafe24-style detail page", () => {
    document.head.innerHTML = `
      <meta property="og:title" content="국산 두툼 욕실화 - 직감">
      <meta property="og:image" content="//cdn.example.com/main.jpg">
      <meta property="product:price:amount" content="12,300">
    `;
    document.body.innerHTML = `
      <section class="xans-product-detail">
        <div class="infoArea">
          <div class="xans-product-option">
            <table><tr><th>색상</th><td><select id="product_option_id1">
              <option value="*">선택</option>
              <option value="IVORY" data-product-option-price="0">아이보리</option>
              <option value="BLACK" data-product-option-price="1000">블랙 (+1,000원)</option>
            </select></td></tr></table>
          </div>
        </div>
      </section>
      <div id="prdDetail">
        <img src="/images/detail.jpg">
        <img ec-data-src="//cdn.example.com/lazy-detail.jpg">
        <p>상세 설명</p>
      </div>
    `;
    const result = parserGlobal.ShoppingdayZicgamCatalogParser.extractProduct(
      document,
      "https://zicgam.com/product/detail.html?product_no=3649&cate_no=48",
      {
        inspect: () => ({ status: "available", evidence: ["구매 가능"] }),
      },
    );

    expect(result).toMatchObject({
      externalProductId: "3649",
      originalName: "국산 두툼 욕실화",
      supplierPrice: 12300,
      availability: "active",
      images: [
        "https://cdn.example.com/main.jpg",
        "https://zicgam.com/images/detail.jpg",
        "https://cdn.example.com/lazy-detail.jpg",
      ],
      options: [
        { name: "색상: 아이보리", price: 0 },
        { name: "색상: 블랙 (+1,000원)", price: 1000 },
      ],
    });
    expect(result.rawDescription).toContain(
      'src="https://zicgam.com/images/detail.jpg"',
    );
    expect(result.rawDescription).toContain(
      'src="https://cdn.example.com/lazy-detail.jpg"',
    );
    expect(result.rawDescription).not.toContain("ec-data-src");
  });

  it("rejects a product page when the approved-member login is required", () => {
    document.head.innerHTML = '<meta property="og:title" content="상품">';
    expect(() =>
      parserGlobal.ShoppingdayZicgamCatalogParser.extractProduct(
        document,
        "https://zicgam.com/product/detail.html?product_no=3649",
        { inspect: () => ({ status: "auth_required", evidence: [] }) },
      ),
    ).toThrow("로그인");
  });

  it("reuses the Cafe24 catalog parser for the Ebul Samchon domain", () => {
    document.body.innerHTML = `
      <nav><a href="/product/list.html?cate_no=132">전체상품</a></nav>
      <ul class="prdList">
        <li><a href="/product/극세사-드림버니/652/category/132/display/1/">상품</a></li>
      </ul>
    `;
    const parser = parserGlobal.ShoppingdayZicgamCatalogParser;
    const baseUrl =
      "https://xn--wr3bq2dn2hzng.com/product/list.html?cate_no=132";

    expect(parser.findAllProductsListUrl(document, baseUrl)).toBe(baseUrl);
    expect(parser.discoverPage(document, baseUrl).productUrls).toEqual([
      "https://xn--wr3bq2dn2hzng.com/product/detail.html?product_no=652",
    ]);
  });

  it("stops before saving Ebul Samchon products when the member price is hidden", () => {
    document.head.innerHTML =
      '<meta property="og:title" content="극세사 드림버니 - 이불삼촌">';
    document.body.innerHTML = `
      <section class="xans-product-detail"><div class="infoArea">
        <span id="span_product_price_text">판매가 회원공개</span>
      </div></section>
    `;

    expect(() =>
      parserGlobal.ShoppingdayZicgamCatalogParser.extractProduct(
        document,
        "https://xn--wr3bq2dn2hzng.com/product/detail.html?product_no=652",
        { inspect: () => ({ status: "available", evidence: [] }) },
      ),
    ).toThrow("공급가");
  });
});
