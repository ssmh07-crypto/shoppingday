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
  it("요청한 네 단계와 위험 확인 항목을 표시한다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);

    expect(screen.getByRole("heading", { name: "키워드 시장 조사" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "연관 키워드 분류" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "품목 조사" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "상품 리뷰 조사" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "샘플 확인" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "상품 등록 초안" })).toBeInTheDocument();
    expect(screen.getByText("카테고리 키워드는 상품명에 절대 포함하지 않습니다.")).toBeInTheDocument();
    expect(screen.getByText("가격 스펙트럼이 넓은가?")).toBeInTheDocument();
    expect(screen.getByText("메인 키워드가 명확하고 대다수 상품이 일치하는가?")).toBeInTheDocument();
    expect(screen.getByText("인증이 필요한 제품인가?")).toBeInTheDocument();
    expect(screen.getByText("엑셀 파일 선택")).toBeInTheDocument();
    expect(screen.getByText("소싱 목록")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "소싱 리스트 추가" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "임시저장" })).toBeInTheDocument();
    expect(screen.getByText("리뷰 파일 선택")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "규칙 기반 리뷰 분석" })).toBeDisabled();
  });

  it("붙여넣은 경쟁 상품 리뷰를 분석해 조사 항목에 반영한다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);
    fireEvent.change(screen.getByLabelText("분석할 리뷰 원문"), {
      target: { value: "5점 튼튼하고 좋아요\n1점 접착력이 약해 떨어져요\n2점 접착력이 약해 또 떨어져요" },
    });
    fireEvent.click(screen.getByRole("button", { name: "규칙 기반 리뷰 분석" }));

    expect(screen.getByText("전체").parentElement).toHaveTextContent("3");
    expect(screen.getByText("단점 반복 표현").parentElement).toHaveTextContent("접착력이");
    fireEvent.click(screen.getByRole("button", { name: "분석 결과를 아래 항목에 반영" }));

    const negativeField = screen.getByText("단점 리뷰").closest("label")!;
    const analyzedValue = negativeField.querySelector("textarea")!.value;
    expect(analyzedValue).toContain("[규칙 기반 리뷰 분석]");
    expect(analyzedValue).toContain("접착력이");
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

  it("예상 판매가를 입력하면 마진 30% 기준 단순 최대 구매단가를 보여준다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);
    const expectedPrice = screen.getByText("내 예상 판매단가").closest("label")!;
    fireEvent.change(expectedPrice.querySelector("input")!, {
      target: { value: "30000" },
    });
    expect(screen.getAllByText("21,000원").length).toBeGreaterThan(0);
    expect(screen.getByText(/수수료·배송비·관부가세/)).toBeInTheDocument();
  });

  it("1688 샘플 후보를 여러 개 추가할 수 있다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);
    fireEvent.click(screen.getByRole("button", { name: "+ 1688 샘플 후보 추가" }));
    expect(screen.getByText("샘플 후보 1")).toBeInTheDocument();
    expect(screen.getByText("1688 링크")).toBeInTheDocument();
  });

  it("키워드를 한 번 클릭해 분류하고 검색수 구간으로 필터링한다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={researchWithKeywords()} />);

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
});

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
