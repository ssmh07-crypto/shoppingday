import { chromium, devices, type Browser, type BrowserContext } from "playwright";
import type {
  NaverShoppingRankReader,
  NaverShoppingRankRequest,
  NaverShoppingRankResult,
} from "../src/modules/channels/naver/naver-shopping-rank";

const DEFAULT_EDGE_PATH =
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BLOCK_MARKERS = [
  "비정상적인 접근",
  "자동입력 방지",
  "접근이 제한",
  "captcha",
  "잠시 후 다시",
];

type ShoppingCandidate = {
  identity: string;
  targetMatched: boolean;
};

export class PlaywrightNaverShoppingRankReader
  implements NaverShoppingRankReader
{
  constructor(
    private readonly executablePath =
      process.env.NAVER_RANK_BROWSER_EXECUTABLE ?? DEFAULT_EDGE_PATH,
  ) {}

  async observe(
    input: NaverShoppingRankRequest,
  ): Promise<{ results: NaverShoppingRankResult[] }> {
    let browser: Browser | null = null;
    try {
      browser = await chromium.launch({
        executablePath: this.executablePath,
        headless: true,
      });
      const pc = await this.observeDevice(browser, input, "pc");
      await new Promise((resolve) => setTimeout(resolve, 800));
      const mobile = await this.observeDevice(browser, input, "mobile");
      return { results: [pc, mobile] };
    } catch (error) {
      const observedAt = new Date().toISOString();
      const message =
        error instanceof Error
          ? error.message.slice(0, 500)
          : "로컬 브라우저를 실행하지 못했습니다.";
      return {
        results: (["pc", "mobile"] as const).map((device) => ({
          device,
          status: "failed",
          rank: null,
          checkedRange: 1,
          observedAt,
          message,
        })),
      };
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  private async observeDevice(
    browser: Browser,
    input: NaverShoppingRankRequest,
    device: "pc" | "mobile",
  ): Promise<NaverShoppingRankResult> {
    const observedAt = new Date().toISOString();
    let context: BrowserContext | null = null;
    try {
      const mobileProfile = devices["Pixel 7"];
      context = await browser.newContext(
        device === "mobile"
          ? {
              userAgent: mobileProfile.userAgent,
              viewport: mobileProfile.viewport,
              deviceScaleFactor: mobileProfile.deviceScaleFactor,
              isMobile: mobileProfile.isMobile,
              hasTouch: mobileProfile.hasTouch,
              locale: "ko-KR",
            }
          : {
              viewport: { width: 1440, height: 1000 },
              locale: "ko-KR",
            },
      );
      const page = await context.newPage();
      const host =
        device === "mobile"
          ? "https://msearch.shopping.naver.com/search/all"
          : "https://search.shopping.naver.com/search/all";
      const url = new URL(host);
      url.searchParams.set("query", input.keyword);
      const response = await page.goto(url.toString(), {
        waitUntil: "domcontentloaded",
        timeout: 12_000,
      });
      if (response && [403, 429].includes(response.status())) {
        return rankResult(
          device,
          "blocked",
          null,
          1,
          observedAt,
          `네이버가 조회를 제한했습니다. HTTP ${response.status()}`,
        );
      }
      await page.waitForTimeout(900);

      const seen = new Set<string>();
      let unchangedScrolls = 0;
      let previousScrollY = -1;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const bodyText = (await page.locator("body").innerText()).slice(0, 20_000);
        const marker = BLOCK_MARKERS.find((value) =>
          bodyText.toLocaleLowerCase("ko-KR").includes(value),
        );
        if (marker) {
          return rankResult(
            device,
            "blocked",
            null,
            Math.max(1, Math.min(seen.size, input.maximumRank)),
            observedAt,
            `네이버 접근 제한 화면이 감지되었습니다: ${marker}`,
          );
        }

        const candidates = await page.evaluate(
          collectShoppingCandidates,
          {
            channelProductNo: input.channelProductNo,
            smartstoreUrl: input.smartstoreUrl,
          },
        );
        for (const candidate of candidates) {
          if (seen.has(candidate.identity)) continue;
          seen.add(candidate.identity);
          if (candidate.targetMatched) {
            return rankResult(
              device,
              "found",
              seen.size,
              seen.size,
              observedAt,
              null,
            );
          }
          if (seen.size >= input.maximumRank) {
            return rankResult(
              device,
              "not_found",
              null,
              input.maximumRank,
              observedAt,
              null,
            );
          }
        }

        const scrollY = await page.evaluate(() => {
          window.scrollBy(0, Math.max(window.innerHeight * 1.8, 900));
          return window.scrollY;
        });
        unchangedScrolls =
          scrollY === previousScrollY ? unchangedScrolls + 1 : 0;
        previousScrollY = scrollY;
        if (unchangedScrolls >= 2) break;
        await page.waitForTimeout(650);
      }

      if (!seen.size) {
        return rankResult(
          device,
          "failed",
          null,
          1,
          observedAt,
          "네이버 검색 결과에서 상품 카드를 식별하지 못했습니다. 검색 화면 구조가 변경되었을 수 있습니다.",
        );
      }
      return rankResult(
        device,
        "not_found",
        null,
        Math.min(seen.size, input.maximumRank),
        observedAt,
        null,
      );
    } catch (error) {
      return rankResult(
        device,
        "failed",
        null,
        1,
        observedAt,
        error instanceof Error
          ? error.message.slice(0, 500)
          : "순위 조회 중 오류가 발생했습니다.",
      );
    } finally {
      await context?.close().catch(() => undefined);
    }
  }
}

function rankResult(
  device: "pc" | "mobile",
  status: NaverShoppingRankResult["status"],
  rank: number | null,
  checkedRange: number,
  observedAt: string,
  message: string | null,
): NaverShoppingRankResult {
  return {
    device,
    status,
    rank,
    checkedRange: Math.max(1, Math.min(100, checkedRange)),
    observedAt,
    message,
  };
}

function collectShoppingCandidates(target: {
  channelProductNo: string;
  smartstoreUrl: string;
}): ShoppingCandidate[] {
  const decodeHref = (value: string) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const candidateIdentity = (value: string) => {
    try {
      const url = new URL(value, "https://search.shopping.naver.com");
      for (const key of [...url.searchParams.keys()]) {
        if (!["nvMid", "productId", "productNo"].includes(key)) {
          url.searchParams.delete(key);
        }
      }
      return `${url.hostname}${url.pathname}${url.search}`;
    } catch {
      return value.trim();
    }
  };
  const productLinkPattern =
    /\/(?:products|catalog)\/\d+|[?&](?:nvMid|productId|productNo)=\d+/i;
  const targetUrl = new URL(target.smartstoreUrl);
  const targetPath = targetUrl.pathname.replace(/\/+$/, "");
  const seenCards = new Set<Element>();
  const seenIdentities = new Set<string>();
  const candidates: ShoppingCandidate[] = [];

  for (const anchor of Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"))) {
    const rawHref = anchor.getAttribute("href") ?? "";
    const href = decodeHref(anchor.href || rawHref);
    if (!productLinkPattern.test(href)) continue;
    const card =
      anchor.closest(
        "li, article, [data-shp-contents-id], [class*='product_item'], [class*='productCard'], [class*='product_card']",
      ) ?? anchor;
    if (seenCards.has(card)) continue;
    seenCards.add(card);

    const links = Array.from(card.querySelectorAll<HTMLAnchorElement>("a[href]"))
      .map((item) => decodeHref(item.href || item.getAttribute("href") || ""))
      .filter((item) => productLinkPattern.test(item));
    const dataIdentity =
      card.getAttribute("data-shp-contents-id") ??
      card.getAttribute("data-product-id") ??
      "";
    const identity = candidateIdentity(
      dataIdentity || links[0] || href,
    );
    if (!identity || seenIdentities.has(identity)) continue;
    seenIdentities.add(identity);

    const searchable = [
      dataIdentity,
      ...links,
      ...Array.from(card.attributes).map((item) => item.value),
    ]
      .join(" ")
      .toLocaleLowerCase("ko-KR");
    candidates.push({
      identity,
      targetMatched:
        searchable.includes(target.channelProductNo) ||
        searchable.includes(targetPath.toLocaleLowerCase("ko-KR")),
    });
  }
  return candidates;
}
