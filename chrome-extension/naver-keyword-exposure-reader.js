/* global chrome, ShoppingdayRankParser */

const EXPOSURE_BLOCK_MARKERS = [
  "비정상적인 접근",
  "자동입력 방지",
  "접근이 제한",
  "captcha",
  "잠시 후 다시",
];

void runKeywordExposure();

async function runKeywordExposure() {
  let request;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "shoppingday.keyword-exposure.ready",
    });
    if (!response?.ok || !response.payload) return;
    request = response.payload;
    const result = await observeKeywordExposure(request);
    await chrome.runtime.sendMessage({
      type: "shoppingday.keyword-exposure.result",
      result,
    });
  } catch (error) {
    if (!request) return;
    await chrome.runtime
      .sendMessage({
        type: "shoppingday.keyword-exposure.result",
        result: exposureResult(
          request.keyword,
          "failed",
          [],
          error instanceof Error
            ? error.message.slice(0, 500)
            : "키워드 노출 분석 중 오류가 발생했습니다.",
        ),
      })
      .catch(() => undefined);
  }
}

async function observeKeywordExposure(request) {
  const seen = new Map();
  let unchangedScrolls = 0;
  let previousScrollY = -1;

  await delay(600);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const bodyText = (document.body?.innerText ?? "").slice(0, 20_000);
    const marker = EXPOSURE_BLOCK_MARKERS.find((value) =>
      bodyText.toLocaleLowerCase("ko-KR").includes(value),
    );
    if (marker) {
      return exposureResult(
        request.keyword,
        "blocked",
        Array.from(seen.values()),
        `네이버 접근 제한 화면이 감지되었습니다: ${marker}`,
      );
    }

    const candidates =
      ShoppingdayRankParser.collectShoppingKeywordExposure(
        document,
        request.keyword,
      );
    for (const candidate of candidates) {
      const existing = seen.get(candidate.identity);
      seen.set(
        candidate.identity,
        existing ? mergeExposureCandidate(existing, candidate) : candidate,
      );
      if (seen.size >= request.maximumProducts) break;
    }
    if (seen.size >= request.maximumProducts) break;

    const scrollY = window.scrollY;
    window.scrollBy(0, Math.max(window.innerHeight * 1.35, 800));
    await delay(1_100);
    unchangedScrolls = scrollY === previousScrollY ? unchangedScrolls + 1 : 0;
    previousScrollY = scrollY;
    if (unchangedScrolls >= 3) break;
  }

  const products = Array.from(seen.values()).slice(0, request.maximumProducts);
  if (!products.length) {
    return exposureResult(
      request.keyword,
      "failed",
      [],
      "네이버 검색 결과에서 가격비교 상품 카드를 식별하지 못했습니다. 화면 구조를 확인해 주세요.",
    );
  }
  return exposureResult(request.keyword, "completed", products, null);
}

function mergeExposureCandidate(existing, current) {
  return {
    ...current,
    title: current.title || existing.title,
    titleMatched: current.titleMatched || existing.titleMatched,
    titleMatchType:
      current.titleMatchType !== "none"
        ? current.titleMatchType
        : existing.titleMatchType,
    titleMatchSegments:
      current.titleMatchSegments?.length > 0
        ? current.titleMatchSegments
        : existing.titleMatchSegments,
    attributeMatched: current.attributeMatched || existing.attributeMatched,
    categoryMatched: current.categoryMatched || existing.categoryMatched,
    matchedIn: Array.from(new Set([...existing.matchedIn, ...current.matchedIn])),
    evidence: current.evidence || existing.evidence,
  };
}

function exposureResult(keyword, status, products, message) {
  return {
    keyword,
    device: "pc",
    status,
    productCount: products.length,
    titleMatchCount: products.filter((item) => item.titleMatched).length,
    attributeMatchCount: products.filter((item) => item.attributeMatched).length,
    categoryMatchCount: products.filter((item) => item.categoryMatched).length,
    observedAt: new Date().toISOString(),
    samples: products
      .filter((item) => item.matchedIn.length > 0)
      .slice(0, 5)
      .map((item) => ({
        title: item.title,
        matchedIn: item.matchedIn,
        evidence: item.evidence,
      })),
    message,
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
