// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

type CatalogParser = {
  discoverPage(root: Document, baseUrl: string): {
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
  it("discovers and deduplicates category, pagination, and product links", () => {
    document.body.innerHTML = `
      <a href="/product/list.html?cate_no=48">욕실용품</a>
      <a href="/product/list.html?cate_no=48&page=2&sort_method=5">2</a>
      <a href="/product/detail.html?product_no=3649&cate_no=48">상품</a>
      <a href="/product/detail.html?product_no=3649&cate_no=48">중복 상품</a>
    `;

    const result = parserGlobal.ShoppingdayZicgamCatalogParser.discoverPage(
      document,
      "https://zicgam.com/index.html",
    );

    expect(result.productUrls).toEqual([
      "https://zicgam.com/product/detail.html?product_no=3649&cate_no=48",
    ]);
    expect(result.listUrls).toEqual([
      "https://zicgam.com/product/list.html?cate_no=48",
      "https://zicgam.com/product/list.html?cate_no=48&page=2",
    ]);
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
      <div id="prdDetail"><img src="/images/detail.jpg"><p>상세 설명</p></div>
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
      ],
      options: [
        { name: "색상: 아이보리", price: 0 },
        { name: "색상: 블랙 (+1,000원)", price: 1000 },
      ],
    });
    expect(result.rawDescription).toContain(
      'src="https://zicgam.com/images/detail.jpg"',
    );
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
});
