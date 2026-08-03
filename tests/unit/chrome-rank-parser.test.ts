// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

type RankParser = {
  collectShoppingCandidates(
    root: Document,
    target: { channelProductNo: string; smartstoreUrl: string },
  ): Array<{ identity: string; targetMatched: boolean }>;
};

const parserGlobal = globalThis as typeof globalThis & {
  ShoppingdayRankParser: RankParser;
};

beforeAll(async () => {
  // @ts-expect-error Chrome runtime script intentionally has no module typings.
  await import("../../chrome-extension/rank-parser.js");
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("Chrome rank extension product-card parser", () => {
  it("excludes ads and matches a target by channel product number", () => {
    document.body.innerHTML = `
      <ul>
        <li class="product_item">
          <a href="https://smartstore.naver.com/other/products/111">first</a>
        </li>
        <li class="product_item" data-shp-area-id="ad_product">
          <span>\uad11\uace0</span>
          <a href="https://smartstore.naver.com/ads/products/222">ad</a>
        </li>
        <li class="product_item">
          <a href="https://smartstore.naver.com/sample/products/1234567890">
            target
          </a>
        </li>
      </ul>
    `;

    const candidates =
      parserGlobal.ShoppingdayRankParser.collectShoppingCandidates(document, {
        channelProductNo: "1234567890",
        smartstoreUrl:
          "https://smartstore.naver.com/sample/products/1234567890",
      });

    expect(candidates).toHaveLength(2);
    expect(candidates[0].targetMatched).toBe(false);
    expect(candidates[1].targetMatched).toBe(true);
  });

  it("counts one product card only once even when it has multiple links", () => {
    document.body.innerHTML = `
      <article class="product_card">
        <a href="https://search.shopping.naver.com/catalog/987">image</a>
        <a href="https://search.shopping.naver.com/catalog/987">title</a>
      </article>
    `;

    const candidates =
      parserGlobal.ShoppingdayRankParser.collectShoppingCandidates(document, {
        channelProductNo: "1234567890",
        smartstoreUrl:
          "https://smartstore.naver.com/sample/products/1234567890",
      });

    expect(candidates).toHaveLength(1);
  });
});
