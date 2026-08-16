// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

type RankParser = {
  collectShoppingCandidates(
    root: Document,
    target: { channelProductNo: string; smartstoreUrl: string },
  ): Array<{ identity: string; targetMatched: boolean }>;
  collectShoppingKeywordExposure(
    root: Document,
    keyword: string,
    contextKeyword?: string,
    contextCategoryName?: string,
  ): Array<{
    identity: string;
    title: string;
    titleMatched: boolean;
    contextMatched: boolean;
    contextCategoryMatched: boolean;
    attributeMatched: boolean;
    categoryMatched: boolean;
    matchedIn: string[];
    evidence: string;
    category: string;
  }>;
  summarizeShoppingCategories(
    products: Array<{ category?: string }>,
    limit?: number,
  ): Array<{ category: string; count: number }>;
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

  it("상품명과 카드 부가정보의 키워드 노출을 분리하고 광고를 제외한다", () => {
    document.body.innerHTML = `
      <ul>
        <li class="product_item">
          <a href="https://search.shopping.naver.com/catalog/101">이미지</a>
          <a class="product_title" href="https://search.shopping.naver.com/catalog/101">스테인리스 야채 탈수기</a>
          <span class="product_spec">용량 3L</span>
        </li>
        <li class="product_item">
          <a class="product_title" href="https://search.shopping.naver.com/catalog/102">야채 물기 제거기</a>
          <span class="product_attribute">재질 스테인리스</span>
        </li>
        <li class="product_item">
          <a class="product_title" href="https://search.shopping.naver.com/catalog/103">주방 도구</a>
          <span class="product_category">주방용품 &gt; 스테인리스용품</span>
        </li>
        <li class="product_item" data-shp-area-id="ad_product">
          <span>광고</span>
          <a class="product_title" href="https://search.shopping.naver.com/catalog/104">스테인리스 광고 상품</a>
        </li>
      </ul>
    `;

    const candidates =
      parserGlobal.ShoppingdayRankParser.collectShoppingKeywordExposure(
        document,
        "스테인리스",
      );

    expect(candidates).toHaveLength(3);
    expect(candidates[0]).toMatchObject({
      title: "스테인리스 야채 탈수기",
      titleMatched: true,
      attributeMatched: false,
      categoryMatched: false,
    });
    expect(candidates[1]).toMatchObject({
      titleMatched: false,
      attributeMatched: true,
      categoryMatched: false,
    });
    expect(candidates[2]).toMatchObject({
      titleMatched: false,
      attributeMatched: false,
      categoryMatched: true,
    });
  });

  it("띄어쓰기가 다른 복합 키워드도 정규화해 찾는다", () => {
    document.body.innerHTML = `
      <article class="product_card">
        <a class="product_name" href="https://search.shopping.naver.com/catalog/201">문에 안 걸리는 낮은 욕실화</a>
      </article>
    `;

    const [candidate] =
      parserGlobal.ShoppingdayRankParser.collectShoppingKeywordExposure(
        document,
        "문에안걸리는",
      );
    expect(candidate?.titleMatched).toBe(true);
  });

  it("상품명 링크가 추적 URL이어도 상품명 클래스와 텍스트를 사용한다", () => {
    document.body.innerHTML = `
      <article class="product_card">
        <a href="https://search.shopping.naver.com/catalog/301">상품 이미지</a>
        <a class="product_link_title" href="https://cr.shopping.naver.com/adcr.nhn?x=tracking">
          가정용 야채 짤순이 오이지 탈수기
        </a>
      </article>
    `;

    const [candidate] =
      parserGlobal.ShoppingdayRankParser.collectShoppingKeywordExposure(
        document,
        "짤순이",
      );
    expect(candidate).toMatchObject({
      title: "가정용 야채 짤순이 오이지 탈수기",
      titleMatched: true,
    });
  });

  it("판매처 name 요소보다 실제 상품 링크 텍스트를 상품명으로 우선한다", () => {
    document.body.innerHTML = `
      <article class="product_card">
        <a class="product_mall_name" href="https://smartstore.naver.com/sample">
          생활용품 판매점 이름이 아주 깁니다
        </a>
        <a href="https://search.shopping.naver.com/catalog/351">
          가정용 야채 짤순이 오이지 탈수기
        </a>
      </article>
    `;

    const [candidate] =
      parserGlobal.ShoppingdayRankParser.collectShoppingKeywordExposure(
        document,
        "짤순이",
      );
    expect(candidate).toMatchObject({
      title: "가정용 야채 짤순이 오이지 탈수기",
      titleMatched: true,
    });
  });

  it("이미지 링크에서 시작해도 상위 상품 카드의 형제 상품명을 찾는다", () => {
    document.body.innerHTML = `
      <div class="search_result_row">
        <div class="thumbnail">
          <a href="https://search.shopping.naver.com/catalog/361">
            <img alt="상품 이미지" />
          </a>
        </div>
        <div class="information">
          <a class="product_link_title" href="https://cr.shopping.naver.com/adcr.nhn?x=opaque">
            스테인리스 대용량 야채 짤순이 탈수기
          </a>
        </div>
      </div>
    `;

    const [candidate] =
      parserGlobal.ShoppingdayRankParser.collectShoppingKeywordExposure(
        document,
        "짤순이",
      );
    expect(candidate).toMatchObject({
      title: "스테인리스 대용량 야채 짤순이 탈수기",
      titleMatched: true,
    });
  });

  it("키워드 검색 결과가 기준 상품군과 연결되는지 별도로 판정한다", () => {
    document.body.innerHTML = `
      <article class="product_card">
        <a class="product_title" href="https://search.shopping.naver.com/catalog/371">
          LED 불빛 어린이 장난감 스피너
        </a>
      </article>
      <article class="product_card">
        <a class="product_title" href="https://search.shopping.naver.com/catalog/372">
          야채 짤순이 스피너 채소 탈수기
        </a>
      </article>
    `;

    const candidates =
      parserGlobal.ShoppingdayRankParser.collectShoppingKeywordExposure(
        document,
        "스피너",
        "야채짤순이",
      );
    expect(candidates).toMatchObject([
      { titleMatched: true, contextMatched: false },
      { titleMatched: true, contextMatched: true },
    ]);
  });

  it("선택한 네이버 카테고리와 검색 상품 카테고리가 일치하는지 판정한다", () => {
    document.body.innerHTML = `
      <article class="product_card">
        <a class="product_title" href="https://search.shopping.naver.com/catalog/381">유청분리기</a>
        <span class="product_category">생활/건강 &gt; 주방용품 &gt; 기타조리기구</span>
      </article>
      <article class="product_card">
        <a class="product_title" href="https://search.shopping.naver.com/catalog/382">야채 짤순이</a>
        <span class="product_category">생활/건강 &gt; 주방용품 &gt; 야채탈수기</span>
      </article>
    `;

    const candidates =
      parserGlobal.ShoppingdayRankParser.collectShoppingKeywordExposure(
        document,
        "유청분리기",
        "야채짤순이",
        "야채탈수기",
      );
    expect(candidates).toMatchObject([
      { contextCategoryMatched: false },
      { contextCategoryMatched: true },
    ]);
  });

  it("복합 키워드가 떨어진 두 단어로 상품명에 있으면 조합 일치로 센다", () => {
    document.body.innerHTML = `
      <article class="product_card">
        <a href="https://search.shopping.naver.com/catalog/401">상품 이미지</a>
        <a class="product_link_title" href="https://cr.shopping.naver.com/adcr.nhn?x=tracking">
          접이식방석 사우나매트 목욕 방수 야외 콘서트방석
        </a>
      </article>
    `;

    const [candidate] =
      parserGlobal.ShoppingdayRankParser.collectShoppingKeywordExposure(
        document,
        "사우나방석",
      );
    expect(candidate).toMatchObject({
      titleMatched: true,
      evidence:
        "[조합: 사우나 + 방석] 접이식방석 사우나매트 목욕 방수 야외 콘서트방석",
    });
  });

  it("복합 키워드 조각 하나만 있는 상품명은 조합 일치로 세지 않는다", () => {
    document.body.innerHTML = `
      <article class="product_card">
        <a href="https://search.shopping.naver.com/catalog/402">상품 이미지</a>
        <a class="product_link_title" href="https://cr.shopping.naver.com/adcr.nhn?x=tracking">
          사우나매트 목욕 방수 야외용
        </a>
      </article>
    `;

    const [candidate] =
      parserGlobal.ShoppingdayRankParser.collectShoppingKeywordExposure(
        document,
        "사우나방석",
      );
    expect(candidate?.titleMatched).toBe(false);
  });

  it("전체 상품 카테고리를 건수순으로 묶어 상위 3개를 반환한다", () => {
    expect(
      parserGlobal.ShoppingdayRankParser.summarizeShoppingCategories([
        { category: "생활/건강 > 주방용품 > 기타조리기구" },
        { category: "생활/건강   > 주방용품 > 기타조리기구" },
        { category: "완구 > 피젯토이" },
        { category: "생활/건강 > 주방용품 > 야채탈수기" },
        { category: "완구 > 피젯토이" },
        { category: "식품 > 유제품" },
        { category: "" },
      ]),
    ).toEqual([
      { category: "생활/건강 > 주방용품 > 기타조리기구", count: 2 },
      { category: "완구 > 피젯토이", count: 2 },
      { category: "생활/건강 > 주방용품 > 야채탈수기", count: 1 },
    ]);
  });
});
