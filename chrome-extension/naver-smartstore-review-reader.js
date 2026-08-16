/* global chrome, ShoppingdaySmartstoreReviewParser */

void initializeReviewImporter();

async function initializeReviewImporter() {
  const response = await chrome.runtime.sendMessage({
    type: "shoppingday.smartstore-review.ready",
  }).catch(() => null);
  if (!response?.ok) return;
  mountImporter(response.payload);
}

function mountImporter(payload) {
  if (document.getElementById("shoppingday-review-importer")) return;
  const panel = document.createElement("aside");
  panel.id = "shoppingday-review-importer";
  panel.style.cssText = [
    "position:fixed", "right:20px", "bottom:20px", "z-index:2147483647",
    "width:280px", "padding:14px", "border:1px solid #15803d",
    "border-radius:12px", "background:#ffffff", "box-shadow:0 12px 30px rgba(0,0,0,.2)",
    "font:13px/1.45 Arial,sans-serif", "color:#172b1f",
  ].join(";");
  panel.innerHTML = `
    <strong style="display:block;font-size:15px;margin-bottom:5px">Shoppingday 리뷰 가져오기</strong>
    <span style="display:block;margin-bottom:10px;color:#52665a">리뷰 탭에서 현재 화면에 표시된 리뷰만 가져옵니다. 다음 페이지로 이동한 뒤 다시 누르면 누적됩니다.</span>
    <button type="button" style="width:100%;padding:9px;border:0;border-radius:7px;background:#15803d;color:#fff;font-weight:700;cursor:pointer">현재 리뷰 가져오기</button>
    <small style="display:block;margin-top:8px;color:#52665a"></small>
  `;
  const button = panel.querySelector("button");
  const status = panel.querySelector("small");
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "현재 화면의 리뷰를 확인하고 있습니다…";
    const reviews = ShoppingdaySmartstoreReviewParser.collectVisibleReviews(document);
    if (!reviews.length) {
      status.textContent = "표시된 리뷰를 찾지 못했습니다. 상품의 리뷰 탭을 열어 주세요.";
      button.disabled = false;
      return;
    }
    const result = await chrome.runtime.sendMessage({
      type: "shoppingday.smartstore-review.result",
      result: {
        status: "completed",
        sourceUrl: location.href,
        productName: document.querySelector("h1")?.textContent?.trim() ?? document.title,
        reviews,
        observedAt: new Date().toISOString(),
      },
    }).catch((error) => ({ ok: false, message: error?.message }));
    status.textContent = result?.ok
      ? `${reviews.length}개를 Shoppingday에 보냈습니다. 중복 리뷰는 자동으로 제외됩니다.`
      : result?.message ?? "Shoppingday로 리뷰를 보내지 못했습니다.";
    button.disabled = false;
  });
  panel.dataset.requestId = payload.requestId ?? "";
  document.documentElement.appendChild(panel);
}
