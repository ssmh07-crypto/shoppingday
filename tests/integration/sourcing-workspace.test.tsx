// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourcingWorkspace } from "@/app/admin/sourcing/sourcing-workspace";
import { defaultSourcingSignals, type SourcingResearchRecord } from "@/modules/sourcing/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("소싱 조사 화면", () => {
  it("네 조사 항목을 기본으로 접고 제거한 항목은 표시하지 않는다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);

    expect(screen.getByRole("heading", { name: "키워드 시장 조사" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "연관 키워드 분류" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "품목 조사" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "상품 리뷰 조사" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "샘플 확인" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "상품 등록 초안" })).not.toBeInTheDocument();
    expect(sectionButton("01 키워드 시장 조사")).toHaveAttribute("aria-expanded", "false");
    expect(sectionButton("02 연관 키워드 분류")).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(sectionButton("03 품목 조사"));
    expect(screen.getByText("가격 스펙트럼이 넓은가?")).toBeInTheDocument();
    expect(screen.getByText("메인 키워드가 명확하고 대다수 상품이 일치하는가?")).toBeInTheDocument();
    expect(screen.getByText("인증이 필요한 제품인가?")).toBeInTheDocument();
    expect(screen.queryByText("쿠팡 평균단가")).not.toBeInTheDocument();
    expect(screen.queryByText("네이버 평균단가")).not.toBeInTheDocument();
    expect(screen.queryByText("내 예상 판매단가")).not.toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "소싱 목록" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "소싱 목록 열기 (0개)" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "소싱 리스트 추가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "임시저장" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "소싱 아이템 저장" })).toBeDisabled();
  });

  it("붙여넣은 경쟁 상품 리뷰를 분석해 조사 항목에 반영한다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);
    fireEvent.click(sectionButton("04 상품 리뷰 조사"));
    fireEvent.change(screen.getByLabelText("분석할 리뷰 원문"), {
      target: { value: "5점 튼튼하고 좋아요\n1점 접착력이 약해 떨어져요\n2점 접착력이 약해 또 떨어져요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "입력 목록에 추가" }));
    fireEvent.click(screen.getByRole("button", { name: "규칙 기반 리뷰 분석" }));

    expect(screen.getByText("전체").parentElement).toHaveTextContent("3");
    expect(screen.getByText("확인된 불편 유형").parentElement).toHaveTextContent("접착력이나 고정력이 약해 쉽게 떨어짐");
    fireEvent.click(screen.getByRole("button", { name: "분석 결과를 아래 항목에 반영" }));

    const negativeField = screen.getByText("단점 리뷰").closest("label")!;
    const analyzedValue = negativeField.querySelector("textarea")!.value;
    expect(analyzedValue).toContain("[규칙 기반 리뷰 분석]");
    expect(analyzedValue).toContain("접착력이나 고정력이 약해 쉽게 떨어짐");
    expect(analyzedValue).not.toContain("접착력이 약해 떨어져요");
  });

  it("리뷰 입력란을 추가하고 한 줄씩 붙여넣어 함께 분석한다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);
    fireEvent.click(sectionButton("04 상품 리뷰 조사"));

    fireEvent.change(screen.getByLabelText("리뷰 1"), {
      target: { value: "5점 튼튼하고 좋아요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ 리뷰 추가" }));
    fireEvent.change(screen.getByLabelText("리뷰 2"), {
      target: { value: "1점 접착력이 약해 떨어져요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "전체 리뷰 접기" }));
    expect(screen.queryByLabelText("리뷰 1")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("리뷰 2")).not.toBeInTheDocument();
    expect(screen.getByText(/리뷰 2개가 접혀 있습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "전체 리뷰 펼치기 (2개)" }));
    expect(screen.getByLabelText("리뷰 2")).toHaveValue("1점 접착력이 약해 떨어져요");
    fireEvent.click(screen.getByRole("button", { name: "규칙 기반 리뷰 분석" }));

    expect(screen.getByText("전체").parentElement).toHaveTextContent("2");
    expect(screen.getByText("장점").parentElement).toHaveTextContent("1");
    expect(screen.getByText("단점").parentElement).toHaveTextContent("1");

    fireEvent.click(screen.getByRole("button", { name: "리뷰 2 삭제" }));
    expect(screen.queryByLabelText("리뷰 2")).not.toBeInTheDocument();
  });

  it("리뷰 원문을 임시저장 요청에 포함하고 다시 연 화면에 복원한다", async () => {
    const initial = {
      ...researchWithKeywords(),
      reviewEntries: [{
        id: "00000000-0000-4000-8000-000000000099",
        content: "기존에 저장한 리뷰",
        rating: null,
        source: "manual" as const,
      }],
    };
    const saved = {
      ...initial,
      reviewEntries: [{
        ...initial.reviewEntries[0],
        content: "임시저장할 리뷰 원문",
      }],
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: saved }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<SourcingWorkspace initialItems={[]} initialDetail={initial} />);
    fireEvent.click(sectionButton("04 상품 리뷰 조사"));
    expect(screen.getByLabelText("리뷰 1")).toHaveValue("기존에 저장한 리뷰");
    fireEvent.change(screen.getByLabelText("리뷰 1"), {
      target: { value: "임시저장할 리뷰 원문" },
    });
    fireEvent.click(screen.getByRole("button", { name: "임시저장" }));

    expect(await screen.findByText("소싱 아이템을 임시저장했습니다.")).toBeInTheDocument();
    const request = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(request.body as string).reviewEntries).toEqual([
      expect.objectContaining({ content: "임시저장할 리뷰 원문" }),
    ]);
    expect(screen.getByLabelText("리뷰 1")).toHaveValue("임시저장할 리뷰 원문");
  });

  it("소싱 리스트 추가를 누르면 빈 소싱 아이템을 저장하고 목록에 표시한다", async () => {
    const created = { ...researchWithKeywords(), sourcingKeyword: "", relatedKeywords: [] };
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: created }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [{
            id: created.id,
            status: created.status,
            sourcingKeyword: "",
            monthlySearchVolume: null,
            sixMonthRevenue: null,
            maximumPurchasePrice: null,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt,
          }],
        }),
      }));

    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);
    fireEvent.click(screen.getByRole("button", { name: "소싱 리스트 추가" }));

    expect(await screen.findByText("새 소싱 아이템을 목록에 추가했습니다.")).toBeInTheDocument();
    expect(screen.getAllByText("새 소싱 아이템").length).toBeGreaterThanOrEqual(2);
  });

  it("검색수는 천 단위 쉼표로, 6개월 매출은 만원 단위로 입력한다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);
    fireEvent.click(sectionButton("01 키워드 시장 조사"));

    const searchVolume = screen.getByText("월간 검색수").closest("label")!;
    fireEvent.change(searchVolume.querySelector("input")!, {
      target: { value: "12820" },
    });
    expect(searchVolume.querySelector("input")).toHaveValue("12,820");

    const revenue = screen.getByText("최근 6개월 매출").closest("label")!;
    fireEvent.change(revenue.querySelector("input")!, {
      target: { value: "12,345" },
    });
    expect(revenue.querySelector("input")).toHaveValue("12,345");
    expect(within(revenue).getByText("만원")).toBeInTheDocument();

  });

  it("키워드를 한 번 클릭해 분류하고 검색수 구간으로 필터링한다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={researchWithKeywords()} />);
    fireEvent.click(sectionButton("02 연관 키워드 분류"));

    const initialKeywordTable = screen.getByRole("table");
    const bathroomRow = within(initialKeywordTable).getByText("욕실화").closest("tr")!;
    const productNameButton = within(bathroomRow).getByRole("button", { name: "상품명" });
    fireEvent.click(productNameButton);
    expect(productNameButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "1,000 이하" }));
    const keywordTable = screen.getByRole("table");
    expect(within(keywordTable).queryByText("욕실화")).not.toBeInTheDocument();
    expect(within(keywordTable).getByText("낮은 욕실화")).toBeInTheDocument();
  });

  it("Chrome 1페이지 분석 근거를 확인하고 추천 분류를 초안에 적용한다", async () => {
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string; keyword: string }>).detail;
      window.dispatchEvent(
        new CustomEvent("shoppingday:keyword-exposure-result", {
          detail: {
            requestId: detail.requestId,
            result: {
              keyword: detail.keyword,
              device: "pc",
              status: "completed",
              productCount: 40,
              titleMatchCount: 16,
              attributeMatchCount: 2,
              categoryMatchCount: 0,
              observedAt: "2026-08-16T00:00:00.000Z",
              samples: [
                {
                  title: "미끄럼방지 욕실화",
                  matchedIn: ["product_name"],
                  evidence: "미끄럼방지 욕실화",
                },
              ],
              message: null,
            },
          },
        }),
      );
    };
    window.addEventListener("shoppingday:keyword-exposure-request", handleRequest);

    render(<SourcingWorkspace initialItems={[]} initialDetail={researchWithKeywords()} />);
    window.dispatchEvent(
      new CustomEvent("shoppingday:rank-extension-status", {
        detail: { available: true, version: "0.5.8" },
      }),
    );
    fireEvent.click(sectionButton("02 연관 키워드 분류"));
    const row = within(screen.getByRole("table")).getByText("욕실화").closest("tr")!;
    fireEvent.click(within(row).getByRole("button", { name: "노출 분석" }));

    expect(await within(row).findByText("상품명 16/40 · 부가정보 2 · 카테고리 0")).toBeInTheDocument();
    expect(within(row).getByText("추천 상품명 키워드")).toBeInTheDocument();
    expect(within(row).getByText("미끄럼방지 욕실화")).toBeInTheDocument();
    fireEvent.click(within(row).getByRole("button", { name: "추천 적용" }));
    expect(within(row).getByRole("button", { name: "상품명" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      screen.getByText(/저장 전까지는 초안에만 적용됩니다/),
    ).toBeInTheDocument();
    window.removeEventListener("shoppingday:keyword-exposure-request", handleRequest);
  });

  it("전체 다시 분류는 기존 분류도 재분석해 추천 위치를 초안에 반영한다", async () => {
    const initial = researchWithKeywords();
    initial.relatedKeywords = [
      { ...initial.relatedKeywords[0]!, placement: "product_name" },
    ];
    vi.stubGlobal("confirm", vi.fn(() => true));
    const handleRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ requestId: string; keyword: string }>).detail;
      window.dispatchEvent(
        new CustomEvent("shoppingday:keyword-exposure-result", {
          detail: {
            requestId: detail.requestId,
            result: {
              keyword: detail.keyword,
              device: "pc",
              status: "completed",
              productCount: 40,
              titleMatchCount: 2,
              attributeMatchCount: 9,
              categoryMatchCount: 0,
              observedAt: "2026-08-16T00:00:00.000Z",
              samples: [],
              message: null,
            },
          },
        }),
      );
    };
    window.addEventListener("shoppingday:keyword-exposure-request", handleRequest);

    render(<SourcingWorkspace initialItems={[]} initialDetail={initial} />);
    window.dispatchEvent(
      new CustomEvent("shoppingday:rank-extension-status", {
        detail: { available: true, version: "0.5.8" },
      }),
    );
    fireEvent.click(sectionButton("02 연관 키워드 분류"));
    fireEvent.click(screen.getByRole("button", { name: "전체 다시 분류" }));

    expect(
      await screen.findByText(/1개 키워드를 다시 분석하고 추천 분류를 초안에 반영했습니다/),
    ).toBeInTheDocument();
    const row = within(screen.getByRole("table")).getByText("욕실화").closest("tr")!;
    expect(within(row).getByRole("button", { name: "속성" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    window.removeEventListener("shoppingday:keyword-exposure-request", handleRequest);
  });

  it("직접 입력한 연관키워드를 기존 목록에 누적한다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={researchWithKeywords()} />);
    fireEvent.click(sectionButton("02 연관 키워드 분류"));

    fireEvent.change(screen.getByLabelText("직접 추가할 연관키워드"), {
      target: { value: "물빠짐 욕실화, 420" },
    });
    fireEvent.click(screen.getByRole("button", { name: "키워드 추가" }));

    expect(within(screen.getByRole("table")).getByText("물빠짐 욕실화")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("욕실화")).toBeInTheDocument();
  });

  it("반폭용 소싱 목록 서랍을 열고 닫는다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={researchWithKeywords()} />);
    const trigger = screen.getByRole("button", { name: "소싱 목록 열기 (0개)" });

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("complementary", { name: "소싱 목록" })).toHaveClass("open");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("complementary", { name: "소싱 목록" })).not.toHaveClass("open");
  });

  it("엑셀에서 가져온 키워드만 전체 삭제하고 직접 입력한 키워드는 유지한다", () => {
    const initial = researchWithKeywords();
    initial.relatedKeywords.push({
      id: "00000000-0000-4000-8000-000000000004",
      keyword: "직접 추가 키워드",
      normalizedKeyword: "직접추가키워드",
      monthlySearchVolume: 320,
      placement: "tag",
      source: "manual",
      importedAt: "2026-07-19T00:00:00.000Z",
    });
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);

    render(<SourcingWorkspace initialItems={[]} initialDetail={initial} />);
    fireEvent.click(sectionButton("02 연관 키워드 분류"));
    fireEvent.click(sectionButton("04 상품 리뷰 조사"));
    fireEvent.click(screen.getByRole("button", { name: "엑셀 키워드 삭제 (2)" }));

    expect(confirmMock).toHaveBeenCalledWith(
      "엑셀에서 가져온 연관키워드 2개를 삭제할까요? 직접 추가한 키워드는 유지됩니다.",
    );
    const keywordTable = within(screen.getByRole("table"));
    expect(keywordTable.queryByText("욕실화")).not.toBeInTheDocument();
    expect(keywordTable.queryByText("낮은 욕실화")).not.toBeInTheDocument();
    expect(keywordTable.getByText("직접 추가 키워드")).toBeInTheDocument();
    expect(
      screen.getByText(
        "엑셀에서 가져온 연관키워드 2개를 삭제했습니다. 변경사항을 저장하려면 임시저장 또는 저장을 눌러 주세요.",
      ),
    ).toBeInTheDocument();
  });

  it("연관 키워드 한 개를 목록에서 삭제한다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={researchWithKeywords()} />);
    fireEvent.click(sectionButton("02 연관 키워드 분류"));

    fireEvent.click(screen.getByRole("button", { name: "욕실화 키워드 삭제" }));

    expect(within(screen.getByRole("table")).queryByText("욕실화")).not.toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("낮은 욕실화")).toBeInTheDocument();
  });

  it("입력한 단어가 포함된 연관키워드를 한 번에 삭제한다", () => {
    const initial = researchWithKeywords();
    initial.relatedKeywords.push(
      {
        id: "00000000-0000-4000-8000-000000000004",
        keyword: "스텐 욕실 선반",
        normalizedKeyword: "스텐욕실선반",
        monthlySearchVolume: 320,
        placement: "product_name",
        source: "manual",
        importedAt: "2026-07-19T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000005",
        keyword: "올스 텐 코너선반",
        normalizedKeyword: "올스텐코너선반",
        monthlySearchVolume: 210,
        placement: "tag",
        source: "itemscout-xlsx",
        importedAt: "2026-07-19T00:00:00.000Z",
      },
    );
    const confirmMock = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmMock);

    render(<SourcingWorkspace initialItems={[]} initialDetail={initial} />);
    fireEvent.click(sectionButton("02 연관 키워드 분류"));
    fireEvent.change(screen.getByLabelText("삭제할 키워드 포함어"), {
      target: { value: "스텐" },
    });

    const deleteButton = screen.getByRole("button", { name: "일치 키워드 삭제 (2)" });
    fireEvent.click(deleteButton);

    expect(confirmMock).toHaveBeenCalledWith(
      "'스텐'이(가) 포함된 연관키워드 2개를 삭제할까요?",
    );
    const keywordTable = within(screen.getByRole("table"));
    expect(keywordTable.queryByText("스텐 욕실 선반")).not.toBeInTheDocument();
    expect(keywordTable.queryByText("올스 텐 코너선반")).not.toBeInTheDocument();
    expect(keywordTable.getByText("욕실화")).toBeInTheDocument();
    expect(screen.getByLabelText("삭제할 키워드 포함어")).toHaveValue("");
    expect(screen.getByText(/연관키워드 2개를 삭제했습니다/)).toBeInTheDocument();
  });

  it("소싱 아이템 저장 시 소싱 결정으로 저장하고 등록 초안을 생성한다", async () => {
    const initial = researchWithKeywords();
    const selected = { ...initial, status: "selected" as const };
    const registered = { ...selected, registrationProductId: "00000000-0000-4000-8000-000000000010" };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: selected }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { productId: registered.registrationProductId, alreadyExists: false } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: registered }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<SourcingWorkspace initialItems={[]} initialDetail={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "소싱 아이템 저장" }));

    expect(await screen.findByText("소싱 아이템을 저장하고 상품 등록 초안을 만들었습니다.")).toBeInTheDocument();
    expect(JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string).status).toBe("researching");
    expect(fetchMock.mock.calls[1]![0]).toBe(`/api/sourcing-researches/${initial.id}/registration-product`);
    expect(screen.getByLabelText("진행 상태")).toHaveValue("selected");
  });

  it("등록 초안이 없는 소싱 아이템을 목록에서 삭제한다", async () => {
    const initial = researchWithKeywords();
    const listItem = {
      id: initial.id,
      status: initial.status,
      sourcingKeyword: initial.sourcingKeyword,
      monthlySearchVolume: initial.monthlySearchVolume,
      sixMonthRevenue: initial.sixMonthRevenue,
      maximumPurchasePrice: initial.maximumPurchasePrice,
      registrationProductId: null,
      createdAt: initial.createdAt,
      updatedAt: initial.updatedAt,
    };
    const confirmMock = vi.fn(() => true);
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { id: initial.id } }),
    });
    vi.stubGlobal("confirm", confirmMock);
    vi.stubGlobal("fetch", fetchMock);

    render(<SourcingWorkspace initialItems={[listItem]} initialDetail={initial} />);
    fireEvent.click(screen.getByRole("button", { name: "욕실화 삭제" }));

    expect(await screen.findByText("소싱 아이템을 삭제했습니다.")).toBeInTheDocument();
    expect(confirmMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/sourcing-researches/${initial.id}`,
      expect.objectContaining({ method: "DELETE", cache: "no-store" }),
    );
    expect(screen.getByText("첫 소싱 키워드를 기록해 보세요.")).toBeInTheDocument();
  });
});

function sectionButton(name: string) {
  return screen.getByRole("button", { name: new RegExp(name) });
}

function researchWithKeywords(): SourcingResearchRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    status: "researching",
    sourcingKeyword: "욕실화",
    monthlySearchVolume: 12820,
    sixMonthRevenue: null,
    marketNotes: "",
    coupangAveragePrice: null,
    naverAveragePrice: null,
    expectedSellingPrice: null,
    maximumPurchasePrice: null,
    registrationProductId: null,
    signals: defaultSourcingSignals,
    finalSellingPoint: "",
    positiveReviews: "",
    negativeReviews: "",
    customerNeeds: "",
    productSpecs: "",
    primaryTarget: "",
    referenceNotes: "",
    reviewEntries: [],
    relatedKeywords: [
      {
        id: "00000000-0000-4000-8000-000000000002",
        keyword: "욕실화",
        normalizedKeyword: "욕실화",
        monthlySearchVolume: 12820,
        placement: "unclassified",
        source: "itemscout-xlsx",
        importedAt: "2026-07-19T00:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        keyword: "낮은 욕실화",
        normalizedKeyword: "낮은욕실화",
        monthlySearchVolume: 790,
        placement: "unclassified",
        source: "itemscout-xlsx",
        importedAt: "2026-07-19T00:00:00.000Z",
      },
    ],
    samples: [],
    createdAt: new Date("2026-07-19T00:00:00.000Z"),
    updatedAt: new Date("2026-07-19T00:00:00.000Z"),
  };
}
