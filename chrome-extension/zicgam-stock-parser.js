(() => {
  function inspect(root, locationLike, requestUrl) {
    const pageText = normalizeText(root.body?.innerText ?? "");
    if (
      locationLike.pathname.includes("/member/login") ||
      /로그인이 필요|회원 등급을 확인|승인회원.*구매/.test(pageText)
    ) {
      return makeResult(requestUrl, "auth_required", {
        evidence: ["직감 로그인 또는 승인회원 확인이 필요합니다."],
      });
    }

    const productRoot =
      root.querySelector(".xans-product-detail .infoArea") ??
      root.querySelector(".xans-product-detail") ??
      root.querySelector(".infoArea") ??
      root.querySelector("#contents");
    const productText = normalizeText(productRoot?.textContent ?? "");
    const productName =
      cleanProductName(
        root
          .querySelector("meta[property='og:title']")
          ?.getAttribute("content"),
      ) ??
      cleanProductName(
        root.querySelector(".headingArea h2, .infoArea h2")?.textContent,
      ) ??
      cleanProductName(root.title);
    const evidence = [];

    const discontinuedMarker = firstMarker(productText, [
      "단종",
      "판매 종료",
      "판매종료",
      "판매 중지",
      "더 이상 판매하지",
    ]);
    if (discontinuedMarker) {
      return makeResult(requestUrl, "discontinued", {
        productName,
        evidence: [`상품 영역에서 '${discontinuedMarker}' 문구를 확인했습니다.`],
      });
    }

    const optionState = inspectOptions(root);
    if (optionState.soldOut.length) {
      evidence.push(`품절 옵션 ${optionState.soldOut.length}개`);
    }
    if (optionState.available.length) {
      evidence.push(`선택 가능 옵션 ${optionState.available.length}개`);
    }
    if (optionState.soldOut.length && optionState.available.length) {
      return makeResult(requestUrl, "partial_sold_out", {
        productName,
        evidence,
        availableOptions: optionState.available,
        soldOutOptions: optionState.soldOut,
      });
    }
    if (optionState.soldOut.length && !optionState.available.length) {
      return makeResult(requestUrl, "sold_out", {
        productName,
        evidence,
        soldOutOptions: optionState.soldOut,
      });
    }

    const soldOutElement = root.querySelector(
      ".xans-product-action [class*='soldout'], .xans-product-detail [class*='soldout'], img[alt*='품절'], img[alt*='SOLD OUT']",
    );
    const soldOutMarker = firstMarker(productText, [
      "SOLD OUT",
      "일시품절",
      "품절된 상품",
      "재입고 알림",
      "현재 품절",
    ]);
    if (soldOutElement || soldOutMarker) {
      return makeResult(requestUrl, "sold_out", {
        productName,
        evidence: [
          soldOutMarker
            ? `상품 영역에서 '${soldOutMarker}' 문구를 확인했습니다.`
            : "품절 표시 요소를 확인했습니다.",
        ],
      });
    }

    const purchaseButton = Array.from(
      root.querySelectorAll(
        "#btnBuy, .xans-product-action a, .xans-product-action button, [onclick*='product_submit']",
      ),
    ).find((element) =>
      /구매|바로구매|장바구니|BUY NOW/i.test(
        normalizeText(
          element.textContent ?? element.getAttribute("alt") ?? "",
        ),
      ),
    );
    if (purchaseButton) {
      return makeResult(requestUrl, "available", {
        productName,
        evidence: ["구매 가능한 상품 버튼을 확인했습니다."],
        availableOptions: optionState.available,
      });
    }

    return makeResult(requestUrl, "unknown", {
      productName,
      evidence: [
        "품절·단종 문구와 구매 가능 버튼을 명확히 식별하지 못했습니다.",
      ],
      availableOptions: optionState.available,
      soldOutOptions: optionState.soldOut,
    });
  }

  function inspectOptions(root) {
    const available = [];
    const soldOut = [];
    for (const option of root.querySelectorAll(
      ".xans-product-option select option, select[id*='product_option_id'] option",
    )) {
      const text = normalizeText(option.textContent ?? "");
      const value = option.getAttribute("value") ?? "";
      if (!text || !value || value === "*" || value === "**") continue;
      if (option.disabled || /품절|SOLD OUT/i.test(text)) soldOut.push(text);
      else available.push(text);
    }
    return {
      available: [...new Set(available)].slice(0, 100),
      soldOut: [...new Set(soldOut)].slice(0, 100),
    };
  }

  function makeResult(url, status, values = {}) {
    return {
      provider: "zicgam",
      status,
      productName: values.productName ?? null,
      checkedAt: new Date().toISOString(),
      source: "chrome_extension",
      url,
      evidence: (values.evidence ?? []).slice(0, 20),
      availableOptions: (values.availableOptions ?? []).slice(0, 100),
      soldOutOptions: (values.soldOutOptions ?? []).slice(0, 100),
    };
  }

  function firstMarker(text, markers) {
    return markers.find((marker) =>
      text.toLocaleLowerCase("ko-KR").includes(
        marker.toLocaleLowerCase("ko-KR"),
      ),
    );
  }

  function cleanProductName(value) {
    const normalized = normalizeText(value ?? "")
      .replace(/\s*[-|]\s*(직감|위탁배송 쇼핑몰).*$/i, "")
      .trim();
    return normalized ? normalized.slice(0, 300) : null;
  }

  function normalizeText(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  globalThis.ShoppingdayZicgamStockParser = { inspect, makeResult };
})();
