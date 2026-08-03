/* global chrome, ShoppingdayZicgamCatalogParser, ShoppingdayZicgamStockParser */

void runCatalogImport();

async function runCatalogImport() {
  const ready = await chrome.runtime
    .sendMessage({ type: "shoppingday.zicgam.catalog.ready" })
    .catch(() => null);
  if (!ready?.ok || !ready.payload) return;
  const request = ready.payload;
  try {
    const catalog = await discoverCatalog(request);
    const approval = await chrome.runtime.sendMessage({
      type: "shoppingday.zicgam.catalog.discovery_complete",
      progress: catalog.summary,
    });
    if (approval?.cancelled) return;
    if (!approval?.ok) {
      throw new Error(approval?.message ?? "발견 상품 수 확인에 실패했습니다.");
    }
    const importStarted = await chrome.runtime.sendMessage({
      type: "shoppingday.zicgam.catalog.import_started",
      progress: { processed: 0, total: catalog.productUrls.length },
    });
    if (importStarted?.cancelled) return;
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let consecutiveFailures = 0;
    for (const url of catalog.productUrls) {
      try {
        const itemStarted = await chrome.runtime.sendMessage({
          type: "shoppingday.zicgam.catalog.item_started",
          url,
          progress: {
            current: processed + 1,
            processed,
            total: catalog.productUrls.length,
          },
        });
        if (itemStarted?.cancelled) return;
        const page = await fetchDocument(url);
        const product = ShoppingdayZicgamCatalogParser.extractProduct(
          page.document,
          page.url,
          ShoppingdayZicgamStockParser,
        );
        const response = await chrome.runtime.sendMessage({
          type: "shoppingday.zicgam.catalog.product",
          product,
          progress: { processed: processed + 1, total: catalog.productUrls.length },
        });
        if (response?.cancelled) return;
        if (!response?.ok) throw new Error(response?.message ?? "상품 저장 실패");
        succeeded += 1;
        consecutiveFailures = 0;
      } catch (error) {
        if (error?.code === "auth_required") throw error;
        failed += 1;
        consecutiveFailures += 1;
        const response = await chrome.runtime.sendMessage({
          type: "shoppingday.zicgam.catalog.item_failed",
          url,
          message: error instanceof Error ? error.message : "상품 판독 실패",
          progress: { processed: processed + 1, total: catalog.productUrls.length },
        });
        if (response?.cancelled) return;
        if (consecutiveFailures >= 20) {
          throw new Error("상품 판독이 20회 연속 실패해 작업을 중단했습니다.");
        }
      }
      processed += 1;
      await delay(request.delayMs);
    }
    await chrome.runtime.sendMessage({
      type: "shoppingday.zicgam.catalog.complete",
      summary: { total: catalog.productUrls.length, processed, succeeded, failed },
    });
  } catch (error) {
    await chrome.runtime.sendMessage({
      type: "shoppingday.zicgam.catalog.failed",
      message:
        error instanceof Error
          ? error.message
          : "직감 전체 상품 가져오기에 실패했습니다.",
    });
  }
}

async function discoverCatalog(request) {
  const entryPage = await fetchDocument(request.startUrl);
  const allProductsUrl =
    ShoppingdayZicgamCatalogParser.findAllProductsListUrl(
      entryPage.document,
      entryPage.url,
    );
  if (!allProductsUrl) {
    throw new Error(
      "직감 홈에서 전체상품 목록 주소를 찾지 못해 작업을 중단했습니다.",
    );
  }
  let currentListUrl = allProductsUrl;
  const visited = new Set();
  const products = new Map();
  const productPages = new Map();
  let displayedTotal = null;
  let displayedTotalInvalid = false;
  let expectedPage = 1;
  let terminalEmptyPage = null;
  while (currentListUrl) {
    if (visited.size >= request.maximumListPages) {
      throw new Error("직감 목록 페이지 안전 한도를 초과했습니다.");
    }
    if (visited.has(currentListUrl)) {
      throw new Error(`직감 목록 ${expectedPage}페이지 주소가 반복되었습니다.`);
    }
    visited.add(currentListUrl);
    const page = await fetchDocument(currentListUrl);
    if (
      new URL(page.url).pathname.includes("/member/login") ||
      page.document.querySelector("form[action*='/member/login'], input[name='member_id']")
    ) {
      throw Object.assign(
        new Error("직감 로그인 또는 승인회원 확인이 필요합니다."),
        { code: "auth_required" },
      );
    }
    const inspected = ShoppingdayZicgamCatalogParser.inspectCatalogPage(
      page.document,
      page.url,
    );
    if (inspected.currentPage !== expectedPage) {
      throw new Error(
        `직감 목록 페이지 번호가 ${expectedPage}에서 ${inspected.currentPage}(으)로 건너뛰었습니다.`,
      );
    }
    if (!inspected.productUrls.length) {
      terminalEmptyPage = expectedPage;
      break;
    }
    if (inspected.activePage !== inspected.currentPage) {
      throw new Error(
        `직감 목록 ${expectedPage}페이지의 활성 페이지 표시를 확인하지 못했습니다.`,
      );
    }
    if (!displayedTotalInvalid && inspected.displayedTotal !== null) {
      if (displayedTotal === null) displayedTotal = inspected.displayedTotal;
      else if (displayedTotal !== inspected.displayedTotal) {
        displayedTotal = null;
        displayedTotalInvalid = true;
      }
    }
    for (const productUrl of inspected.productUrls) {
      const id = ShoppingdayZicgamCatalogParser.productNo(new URL(productUrl));
      if (!id) continue;
      const previousPage = productPages.get(id);
      if (previousPage) {
        throw new Error(
          `직감 상품번호 ${id}가 목록 ${previousPage}페이지와 ${expectedPage}페이지에 중복 표시되어 완전성을 확인할 수 없습니다.`,
        );
      }
      productPages.set(id, expectedPage);
      products.set(id, productUrl);
    }
    const progress = await chrome.runtime.sendMessage({
      type: "shoppingday.zicgam.catalog.discovery",
      progress: {
        listPages: visited.size,
        currentPage: inspected.currentPage,
        pageItemCount: inspected.productUrls.length,
        discoveredProducts: products.size,
        displayedTotal,
        hasNextPage: true,
      },
    });
    if (progress?.cancelled) throw new Error("사용자가 가져오기를 중단했습니다.");
    expectedPage += 1;
    currentListUrl = ShoppingdayZicgamCatalogParser.catalogPageUrl(
      allProductsUrl,
      expectedPage,
    );
    await delay(request.discoveryDelayMs);
  }
  if (!products.size) {
    throw new Error("직감 상품 목록에서 상품 상세 주소를 찾지 못했습니다.");
  }
  if (terminalEmptyPage === null) {
    throw new Error("직감 상품이 없는 마지막 확인 페이지를 찾지 못했습니다.");
  }
  return {
    productUrls: [...products.entries()]
      .sort(([left], [right]) => Number(left) - Number(right))
      .map(([, url]) => url),
    summary: {
      listPages: terminalEmptyPage - 1,
      lastPage: terminalEmptyPage - 1,
      terminalEmptyPage,
      discoveredProducts: products.size,
      displayedTotal,
      verificationSource:
        displayedTotal === null ? "empty_page" : "empty_page_and_site_total",
    },
  };
}

async function fetchDocument(url) {
  const response = await fetch(url, {
    credentials: "include",
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`직감 페이지 HTTP ${response.status}`);
  const html = await response.text();
  return {
    document: new DOMParser().parseFromString(html, "text/html"),
    url: response.url || url,
  };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
