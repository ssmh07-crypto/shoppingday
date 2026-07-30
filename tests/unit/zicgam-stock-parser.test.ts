// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

type AvailabilityStatus =
  | "available"
  | "partial_sold_out"
  | "sold_out"
  | "discontinued"
  | "auth_required"
  | "unknown"
  | "failed";

type ZicgamStockParser = {
  inspect(
    root: Document,
    locationLike: { pathname: string },
    requestUrl: string,
  ): {
    status: AvailabilityStatus;
    availableOptions: string[];
    soldOutOptions: string[];
  };
};

const parserGlobal = globalThis as typeof globalThis & {
  ShoppingdayZicgamStockParser: ZicgamStockParser;
};

const productUrl =
  "https://zicgam.com/product/detail.html?product_no=3649&cate_no=48&display_group=1";

beforeAll(async () => {
  // @ts-expect-error Chrome runtime script intentionally has no module typings.
  await import("../../chrome-extension/zicgam-stock-parser.js");
});

beforeEach(() => {
  document.head.innerHTML =
    '<meta property="og:title" content="\uc9c1\uac10 \ud14c\uc2a4\ud2b8 \uc0c1\ud488">';
  document.body.innerHTML = "";
});

describe("Zicgam dropship availability parser", () => {
  it("distinguishes a page that requires an approved-member login", () => {
    document.body.innerHTML =
      "<main>\uc120\ud0dd\ud558\uc2e0 \uc0c1\ud488\uc740 \uc2b9\uc778\ud68c\uc6d0\ub9cc \uad6c\ub9e4\ud560 \uc218 \uc788\uc5b4\uc694. \ud68c\uc6d0 \ub4f1\uae09\uc744 \ud655\uc778\ud574 \uc8fc\uc138\uc694.</main>";

    const result = parserGlobal.ShoppingdayZicgamStockParser.inspect(
      document,
      { pathname: "/member/login.html" },
      productUrl,
    );

    expect(result.status).toBe("auth_required");
  });

  it("records partial sold-out when options include both states", () => {
    document.body.innerHTML = `
      <section class="xans-product-detail">
        <div class="infoArea">
          <h2>\uc9c1\uac10 \ud14c\uc2a4\ud2b8 \uc0c1\ud488</h2>
          <div class="xans-product-option">
            <select id="product_option_id1">
              <option value="*">\uc635\uc158 \uc120\ud0dd</option>
              <option value="RED">\ub808\ub4dc</option>
              <option value="BLUE" disabled>\ube14\ub8e8 [\ud488\uc808]</option>
            </select>
          </div>
          <div class="xans-product-action"><a id="btnBuy">\ubc14\ub85c\uad6c\ub9e4</a></div>
        </div>
      </section>
    `;

    const result = parserGlobal.ShoppingdayZicgamStockParser.inspect(
      document,
      { pathname: "/product/detail.html" },
      productUrl,
    );

    expect(result.status).toBe("partial_sold_out");
    expect(result.availableOptions).toEqual(["\ub808\ub4dc"]);
    expect(result.soldOutOptions).toEqual(["\ube14\ub8e8 [\ud488\uc808]"]);
  });

  it("distinguishes an explicit discontinued marker in the product area", () => {
    document.body.innerHTML = `
      <section class="xans-product-detail">
        <div class="infoArea">
          <h2>\uc9c1\uac10 \ud14c\uc2a4\ud2b8 \uc0c1\ud488</h2>
          <p>\ubcf8 \uc0c1\ud488\uc740 \ub2e8\uc885\ub418\uc5c8\uc2b5\ub2c8\ub2e4.</p>
        </div>
      </section>
    `;

    const result = parserGlobal.ShoppingdayZicgamStockParser.inspect(
      document,
      { pathname: "/product/detail.html" },
      productUrl,
    );

    expect(result.status).toBe("discontinued");
  });

  it("records available when a purchase button is present", () => {
    document.body.innerHTML = `
      <section class="xans-product-detail">
        <div class="infoArea">
          <h2>\uc9c1\uac10 \ud14c\uc2a4\ud2b8 \uc0c1\ud488</h2>
          <div class="xans-product-action"><button id="btnBuy">\uad6c\ub9e4\ud558\uae30</button></div>
        </div>
      </section>
    `;

    const result = parserGlobal.ShoppingdayZicgamStockParser.inspect(
      document,
      { pathname: "/product/detail.html" },
      productUrl,
    );

    expect(result.status).toBe("available");
  });

  it("records available when selectable options exist without a recognized purchase button", () => {
    document.body.innerHTML = `
      <section class="xans-product-detail">
        <div class="infoArea">
          <h2>국산 두툼 욕실화 280mm 4color</h2>
          <div class="xans-product-option">
            <select id="product_option_id1">
              <option value="*">옵션 선택</option>
              <option value="SAND">샌드</option>
              <option value="IVORY">아이보리</option>
              <option value="GREEN">그린</option>
              <option value="CHARCOAL">차콜</option>
            </select>
          </div>
        </div>
      </section>
    `;

    const result = parserGlobal.ShoppingdayZicgamStockParser.inspect(
      document,
      { pathname: "/product/detail.html" },
      productUrl,
    );

    expect(result.status).toBe("available");
    expect(result.availableOptions).toEqual([
      "샌드",
      "아이보리",
      "그린",
      "차콜",
    ]);
  });
});
