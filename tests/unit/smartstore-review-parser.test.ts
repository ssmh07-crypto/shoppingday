// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

type SmartstoreReviewParser = {
  collectVisibleReviews(root: Document): Array<{ content: string; rating: number | null }>;
};

const parserGlobal = globalThis as typeof globalThis & {
  ShoppingdaySmartstoreReviewParser: SmartstoreReviewParser;
};

beforeAll(async () => {
  // @ts-expect-error Chrome runtime parser intentionally has no module typings.
  await import("../../chrome-extension/naver-smartstore-review-parser.js");
});

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("Smartstore visible review parser", () => {
  it("reads review text and rating from the visible review section", () => {
    document.body.innerHTML = `
      <section id="REVIEW">
        <ul>
          <li data-review-id="one">
            <span aria-label="평점 5"></span>
            <span>2026.08.16</span>
            <p class="review_text">튼튼하고 사용하기 편해요.</p>
          </li>
          <li data-review-id="two">
            <span>별점 2</span>
            <span>구매옵션: 대형</span>
            <p data-review-content>생각보다 물이 잘 빠지지 않아요.</p>
          </li>
        </ul>
      </section>`;

    expect(parserGlobal.ShoppingdaySmartstoreReviewParser.collectVisibleReviews(document)).toEqual([
      { content: "튼튼하고 사용하기 편해요.", rating: 5 },
      { content: "생각보다 물이 잘 빠지지 않아요.", rating: 2 },
    ]);
  });

  it("ignores hidden and duplicate reviews", () => {
    document.body.innerHTML = `
      <div id="REVIEW">
        <article data-review-id="one"><span>평점 4</span><p>세척하기 간편합니다.</p></article>
        <article data-review-id="two"><span>평점 4</span><p>세척하기 간편합니다.</p></article>
        <article data-review-id="three" hidden><span>평점 1</span><p>보이면 안 됩니다.</p></article>
      </div>`;

    expect(parserGlobal.ShoppingdaySmartstoreReviewParser.collectVisibleReviews(document)).toEqual([
      { content: "세척하기 간편합니다.", rating: 4 },
    ]);
  });
});
