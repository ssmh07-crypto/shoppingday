// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KeywordManager } from "@/app/admin/keywords/keyword-manager";
import type {
  KeywordCandidateRecord,
  ManagedProductDetail,
  ManagedProductSummary,
} from "@/modules/keywords/types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("성장 상품 키워드 관리 화면", () => {
  it("그룹과 검색량 필터를 바꿔도 선택 상태를 유지한다", () => {
    renderManager();

    const medium = screen.getByRole("checkbox", {
      name: "여성 린넨 원피스 선택",
    });
    fireEvent.click(medium);
    expect(medium).toBeChecked();

    fireEvent.click(screen.getByRole("button", { name: "소형" }));
    expect(
      screen.queryByRole("checkbox", { name: "여성 린넨 원피스 선택" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "중형" }));
    expect(
      screen.getByRole("checkbox", { name: "여성 린넨 원피스 선택" }),
    ).toBeChecked();

    fireEvent.change(screen.getByRole("spinbutton", { name: "최소 월간 검색량" }), {
      target: { value: "6000" },
    });
    expect(screen.getByText("현재 필터에 맞는 키워드가 없습니다.")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "최소 월간 검색량" }), {
      target: { value: "0" },
    });
    expect(
      screen.getByRole("checkbox", { name: "여성 린넨 원피스 선택" }),
    ).toBeChecked();
  });

  it("Mock 데이터를 실제 검색량처럼 오해하지 않도록 표시한다", () => {
    renderManager();
    expect(screen.getByText("Mock 데이터", { selector: ".keyword-runtime" })).toBeVisible();
    expect(screen.getAllByText("Mock").length).toBeGreaterThan(0);
  });

  it("생성형 AI 없이 규칙 기반 기본 모드를 표시한다", () => {
    renderManager({
      mockMode: false,
      searchAdConfigured: true,
      apiHubConfigured: false,
    });
    expect(screen.getByText("규칙 기반 기본 모드")).toBeVisible();
    expect(screen.queryByText(/외부 API 키가 아직 설정되지 않았습니다/)).not.toBeInTheDocument();
    expect(screen.getByText(/월간 검색량 1,000 이하를/)).toBeVisible();
    expect(screen.getByText("초기 공략 후보")).toBeVisible();
  });

  it("선택한 키워드만 서버에 보내 상품명 초안을 만든다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
        success: true,
        data: {
          id: "title-1",
          generatedTitle: "여성 원피스 여름 린넨 루즈핏",
          editedTitle: "여성 원피스 여름 린넨 루즈핏",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ success: true, items: [summary] }),
      );
    vi.stubGlobal("fetch", fetcher);
    renderManager();

    fireEvent.click(
      screen.getByRole("button", { name: "선택한 키워드로 초안 만들기" }),
    );

    await waitFor(() =>
      expect(screen.getByPlaceholderText("초안을 만든 뒤 직접 수정하세요."))
        .toHaveValue("여성 원피스 여름 린넨 루즈핏"),
    );
    expect(fetcher).toHaveBeenCalledWith(
      "/api/keyword-products/product-1/titles",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          selectedKeywordIds: ["keyword-small"],
          bannedWords: [],
        }),
      }),
    );
  });

  it("상품명 편집 중 검색 품질 권장사항을 실시간으로 안내한다", () => {
    renderManager();

    fireEvent.change(screen.getByPlaceholderText("초안을 만든 뒤 직접 수정하세요."), {
      target: { value: "여성 원피스 원피스 패션용품 무료배송" },
    });

    expect(screen.getByText("품질 확인 3건")).toBeVisible();
    expect(screen.getByText(/같은 단어가 반복됩니다/)).toBeVisible();
    expect(screen.getByText(/넓은 분류어를 확인하세요/)).toBeVisible();
    expect(screen.getByText(/홍보성 표현/)).toBeVisible();
    expect(screen.getByText(/노출 순위를 보장하지 않습니다/)).toBeVisible();
  });

  it("키워드 후보 만들기로 분석 저장과 네이버 지표 조회를 연속 실행한다", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ success: true, data: detail }))
      .mockResolvedValueOnce(Response.json({ success: true, data: detail }))
      .mockResolvedValueOnce(Response.json({ success: true, data: detail }))
      .mockResolvedValueOnce(Response.json({ success: true, items: [summary] }));
    vi.stubGlobal("fetch", fetcher);
    renderManager({ mockMode: false, searchAdConfigured: true, apiHubConfigured: false });

    expect(screen.queryByLabelText("원피스 다른 분류로 이동")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "키워드 후보 만들기" }));

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "/api/keyword-products/product-1",
      "/api/keyword-products/product-1/candidates",
      "/api/keyword-products/product-1/metrics",
      "/api/keyword-products",
    ]);
    expect(screen.getByText(/검색량과 경쟁도를 조회했습니다/)).toBeVisible();
  });
});

function renderManager(runtime: {
  mockMode: boolean;
  searchAdConfigured: boolean;
  apiHubConfigured: boolean;
} = {
  mockMode: true,
  searchAdConfigured: false,
  apiHubConfigured: false,
}) {
  render(
    <KeywordManager
      initialItems={[summary]}
      initialDetail={detail}
      initialRuntime={runtime}
    />,
  );
}

const productInput = {
  supplierTitle: "여성 린넨 루즈핏 원피스",
  description: "여름용 린넨 혼방 원피스",
  category: "패션의류 > 여성의류 > 원피스",
  features: ["루즈핏"],
  materials: ["린넨 혼방"],
  colors: ["베이지"],
  sizes: ["FREE"],
  target: "여성",
  seasons: ["여름"],
  supplierUrl: "",
  imageUrls: [],
  memo: "",
};

const summary: ManagedProductSummary = {
  id: "product-1",
  smartstoreUrl: "https://smartstore.naver.com/sample/products/1234567890",
  channelProductNo: "1234567890",
  supplierTitle: productInput.supplierTitle,
  editableTitle: productInput.supplierTitle,
  finalTitle: null,
  status: "analyzed",
  keywordCount: 3,
  selectedKeywordCount: 1,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const detail: ManagedProductDetail = {
  product: {
    id: summary.id,
    smartstoreUrl: summary.smartstoreUrl,
    channelProductNo: summary.channelProductNo,
    linkedProductId: null,
    supplierTitle: productInput.supplierTitle,
    currentTitle: null,
    editableTitle: productInput.supplierTitle,
    finalTitle: null,
    productInput,
    status: "analyzed",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  analysis: {
    id: "analysis-1",
    analysis: {
      productType: "원피스",
      productTypes: ["원피스"],
      primaryProductType: "원피스",
      productTypeStatus: "user_confirmed",
      targetCustomers: ["여성"],
      materials: ["린넨 혼방"],
      purposes: ["일상복"],
      forms: ["루즈핏"],
      features: ["루즈핏"],
      colors: [],
      sizes: ["FREE"],
      styles: ["내추럴"],
      seasons: ["여름"],
      useCases: ["일상복"],
      categoryTerms: [],
      unclassifiedTerms: [],
      searchConcepts: ["여성 원피스", "린넨 원피스"],
      analysisSource: "rule-based",
      userReviewedAt: null,
    },
    model: "mock-keyword-analysis-v1",
    source: "mock",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  },
  keywords: [
    candidate("keyword-small", "여성 원피스", "small", 700, true, 0),
    candidate("keyword-medium", "여성 린넨 원피스", "medium", 5_000, false, 1),
    candidate("keyword-large", "원피스", "large", 20_000, false, 2),
  ],
  titles: [],
};

function candidate(
  id: string,
  keyword: string,
  keywordSize: KeywordCandidateRecord["keywordSize"],
  total: number,
  isSelected: boolean,
  recommendationOrder: number,
): KeywordCandidateRecord {
  return {
    id,
    keyword,
    normalizedKeyword: keyword,
    recommendationReason: "상품과 직접 관련된 키워드",
    sourceConcepts: [keyword],
    recommendationOrder,
    origin: "rule_combination",
    reviewStatus: "candidate",
    filterReasons: [],
    relevanceScore: 100 - recommendationOrder,
    monthlyPcSearchVolume: Math.floor(total / 4),
    monthlyMobileSearchVolume: total - Math.floor(total / 4),
    totalMonthlySearchVolume: total,
    rawMonthlyPcSearchVolume: String(Math.floor(total / 4)),
    rawMonthlyMobileSearchVolume: String(total - Math.floor(total / 4)),
    competition: "medium",
    keywordSize,
    metricsStatus: "success",
    metricsSource: "mock",
    metricsFetchedAt: new Date("2026-01-01T00:00:00Z"),
    isSelected,
  };
}
