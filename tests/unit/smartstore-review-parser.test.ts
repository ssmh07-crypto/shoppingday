// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

type SmartstoreReviewParser = {
  collectVisibleReviews(root: Document): Array<{ content: string; rating: number | null }>;
  reviewRating(card: Element): number | null;
};

const parserGlobal = globalThis as typeof globalThis & {
  ShoppingdaySmartstoreReviewParser: SmartstoreReviewParser;
};

beforeAll(async () => {
  // @ts-expect-error Chrome runtime parser intentionally has no module typings.
  await import("../../chrome-extension/naver-smartstore-review-parser.js");
});

beforeEach(() => {
  document.head.innerHTML = "";
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

  it("정렬 전 목록이 숨겨진 부모 영역에 남아 있어도 현재 보이는 정렬 결과만 읽는다", () => {
    document.body.innerHTML = `
      <section id="REVIEW-default" aria-hidden="true">
        <article data-review-id="default-one">
          <span>평점 5</span><p>기본 정렬 첫 번째 리뷰입니다.</p>
        </article>
      </section>
      <section id="REVIEW-low-rating">
        <article data-review-id="low-one">
          <span>평점 1</span><p>낮은 평점 첫 번째 리뷰입니다.</p>
        </article>
        <article data-review-id="low-two">
          <span>평점 2</span><p>낮은 평점 두 번째 리뷰입니다.</p>
        </article>
      </section>`;

    expect(parserGlobal.ShoppingdaySmartstoreReviewParser.collectVisibleReviews(document)).toEqual([
      { content: "낮은 평점 첫 번째 리뷰입니다.", rating: 1 },
      { content: "낮은 평점 두 번째 리뷰입니다.", rating: 2 },
    ]);
  });

  it("CSS로 숨겨진 이전 정렬 목록도 제외한다", () => {
    document.head.innerHTML = `<style>.previous-review-list { display: none; }</style>`;
    document.body.innerHTML = `
      <section id="REVIEW-old" class="previous-review-list">
        <article data-review-id="old"><span>평점 5</span><p>숨은 기본 리뷰입니다.</p></article>
      </section>
      <section id="REVIEW-current">
        <article data-review-id="current"><span>평점 1</span><p>현재 낮은 평점 리뷰입니다.</p></article>
      </section>`;

    expect(parserGlobal.ShoppingdaySmartstoreReviewParser.collectVisibleReviews(document)).toEqual([
      { content: "현재 낮은 평점 리뷰입니다.", rating: 1 },
    ]);
  });

  it("네이버의 여러 별점 표기에서 실제 평점을 읽는다", () => {
    document.body.innerHTML = `
      <article id="aria"><span aria-label="5점 만점에 1점"></span></article>
      <article id="fraction"><span title="2점 / 5점"></span></article>
      <article id="alt"><img alt="별점 3점" /></article>
      <article id="data"><span data-rating="4"></span></article>
      <article id="meter"><span class="review-star-fill" style="width: 100%"></span></article>`;
    const parser = parserGlobal.ShoppingdaySmartstoreReviewParser;

    expect(parser.reviewRating(document.querySelector("#aria")!)).toBe(1);
    expect(parser.reviewRating(document.querySelector("#fraction")!)).toBe(2);
    expect(parser.reviewRating(document.querySelector("#alt")!)).toBe(3);
    expect(parser.reviewRating(document.querySelector("#data")!)).toBe(4);
    expect(parser.reviewRating(document.querySelector("#meter")!)).toBe(5);
  });
});
