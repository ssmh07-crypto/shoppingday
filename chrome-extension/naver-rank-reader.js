/* global chrome, ShoppingdayRankParser */

const BLOCK_MARKERS = [
  "비정상적인 접근",
  "자동입력 방지",
  "접근이 제한",
  "captcha",
  "잠시 후 다시",
];

void run();

async function run() {
  let request;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "shoppingday.rank.ready",
    });
    if (!response?.ok || !response.payload) return;
    request = response.payload;
    const result = await observe(request);
    await chrome.runtime.sendMessage({
      type: "shoppingday.rank.result",
      result,
    });
  } catch (error) {
    if (!request) return;
    await chrome.runtime
      .sendMessage({
        type: "shoppingday.rank.result",
        result: rankResult(
          "failed",
          null,
          1,
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Chrome 순위 조회 중 오류가 발생했습니다.",
        ),
      })
      .catch(() => undefined);
  }
}

async function observe(request) {
  const seen = new Set();
  let unchangedScrolls = 0;
  let previousScrollY = -1;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const bodyText = (document.body?.innerText ?? "").slice(0, 20_000);
    const marker = BLOCK_MARKERS.find((value) =>
      bodyText.toLocaleLowerCase("ko-KR").includes(value),
    );
    if (marker) {
      return rankResult(
        "blocked",
        null,
        Math.max(1, Math.min(seen.size, request.maximumRank)),
        `네이버 접근 제한 화면이 감지되었습니다: ${marker}`,
      );
    }

    const candidates =
      ShoppingdayRankParser.collectShoppingCandidates(document, request);
    for (const candidate of candidates) {
      if (seen.has(candidate.identity)) continue;
      seen.add(candidate.identity);
      if (candidate.targetMatched) {
        return rankResult("found", seen.size, seen.size, null);
      }
      if (seen.size >= request.maximumRank) {
        return rankResult("not_found", null, request.maximumRank, null);
      }
    }

    const scrollY = window.scrollY;
    window.scrollBy(0, Math.max(window.innerHeight * 1.35, 800));
    await delay(1_100);
    unchangedScrolls = scrollY === previousScrollY ? unchangedScrolls + 1 : 0;
    previousScrollY = scrollY;
    if (unchangedScrolls >= 3) break;
  }

  if (!seen.size) {
    return rankResult(
      "failed",
      null,
      1,
      "네이버 검색 결과에서 가격비교 상품 카드를 식별하지 못했습니다. 화면 구조를 확인해 주세요.",
    );
  }
  return rankResult(
    "not_found",
    null,
    Math.min(seen.size, request.maximumRank),
    null,
  );
}

function rankResult(status, rank, checkedRange, message) {
  return {
    device: "pc",
    status,
    rank,
    checkedRange: Math.max(1, Math.min(100, checkedRange)),
    observedAt: new Date().toISOString(),
    message,
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
