import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  isRelevantRelatedKeyword,
  isSimilarProductTitle,
  KeywordManagementService,
} from "@/modules/keywords/keyword-service";
import type { KeywordManagementRepository } from "@/modules/keywords/keyword-repository";
import type {
  KeywordMetrics,
  ManagedProductDetail,
} from "@/modules/keywords/types";

describe("키워드 관리 서비스", () => {
  it("분석 방식이 없으면 가짜 분석을 만들지 않는다", async () => {
    const repository = fakeRepository();
    const service = new KeywordManagementService(repository, null, null, config);
    await expect(service.analyze("owner-1", "product-1")).rejects.toMatchObject({
      code: "external_api_not_configured",
      status: 503,
    });
    expect(repository.saveAnalysis).not.toHaveBeenCalled();
  });

  it("일부 검색량 실패를 보존하되 오류 결과는 24시간 캐시하지 않는다", async () => {
    const repository = fakeRepository();
    const success = metric("여성 원피스", "success", 1_300);
    const failure = metric("여성 린넨 원피스", "error", null);
    const metricsClient = {
      fetchKeywordMetrics: vi.fn().mockResolvedValue([success, failure]),
    };
    const service = new KeywordManagementService(
      repository,
      null,
      metricsClient,
      config,
    );

    await service.refreshMetrics("owner-1", "product-1");

    expect(metricsClient.fetchKeywordMetrics).toHaveBeenCalledWith([
      "여성 원피스",
      "여성 린넨 원피스",
    ]);
    expect(repository.cacheMetrics).toHaveBeenCalledWith(
      [success],
      expect.any(Date),
    );
    expect(repository.applyMetrics).toHaveBeenCalledWith(
      "owner-1",
      "product-1",
      [success, failure],
    );
  });

  it("네이버 연관 키워드를 남은 후보 슬롯에 추가하고 실제 검색량을 적용한다", async () => {
    const repository = fakeRepository();
    const related = metric("여름 원피스", "success", 2_400);
    const duplicate = metric("여성원피스", "success", 1_500);
    const unrelated = metric("여름 블라우스", "success", 4_000);
    const expanded = {
      ...detail,
      keywords: [
        ...detail.keywords,
        candidate("33333333-3333-4333-8333-333333333333", "여름 원피스"),
      ],
    };
    vi.mocked(repository.find)
      .mockResolvedValueOnce(detail)
      .mockResolvedValueOnce(expanded)
      .mockResolvedValue(expanded);
    const metricsClient = {
      discoverKeywordMetrics: vi
        .fn()
        .mockResolvedValue([related, duplicate, unrelated]),
      fetchKeywordMetrics: vi.fn().mockImplementation(async (keywords: string[]) =>
        keywords.map((keyword) => metric(keyword, "success", 1_000)),
      ),
    };
    const service = new KeywordManagementService(
      repository,
      null,
      metricsClient,
      config,
    );

    await service.refreshMetrics("owner-1", "product-1");

    expect(repository.addKeywordCandidates).toHaveBeenCalledWith(
      "owner-1",
      "product-1",
      expect.arrayContaining([
        expect.objectContaining({
          keyword: "여름 원피스",
          reason: "네이버 검색광고 키워드 도구가 반환한 연관 키워드입니다.",
          sourceConcepts: [],
          origin: "naver_related",
          reviewStatus: "accepted",
        }),
        expect.objectContaining({
          keyword: "여름 블라우스",
          reviewStatus: "rejected",
          filterReasons: ["상품 유형 불일치"],
        }),
      ]),
    );
    expect(repository.applyMetrics).toHaveBeenCalledWith(
      "owner-1",
      "product-1",
      expect.arrayContaining([expect.objectContaining({ keyword: "여름 원피스" })]),
    );
  });

  it("다른 상품의 키워드 ID가 섞이면 선택을 거부한다", async () => {
    const repository = fakeRepository();
    vi.mocked(repository.saveSelection).mockResolvedValue(["여성 원피스"]);
    const service = new KeywordManagementService(repository, null, null, config);
    await expect(
      service.saveSelection("owner-1", "product-1", {
        selectedKeywordIds: [keywordId, otherKeywordId],
      }),
    ).rejects.toMatchObject({ code: "invalid_selection", status: 400 });
  });

  it("상품 소재와 충돌하는 네이버 연관 키워드를 제외한다", () => {
    const ironThimble: ManagedProductDetail = {
      ...detail,
      product: {
        ...detail.product,
        productInput: {
          ...detail.product.productInput,
          supplierTitle: "철제 바느질 골무",
        },
      },
      analysis: {
        id: "analysis-1",
        analysis: {
          productType: "골무",
          productTypes: ["골무"],
          primaryProductType: "골무",
          productTypeStatus: "user_confirmed",
          targetCustomers: [],
          materials: [],
          purposes: ["바느질"],
          forms: [],
          features: [],
          colors: [],
          sizes: [],
          styles: [],
          seasons: [],
          useCases: ["바느질"],
          categoryTerms: [],
          unclassifiedTerms: [],
          searchConcepts: ["골무"],
          analysisSource: "rule-based",
          userReviewedAt: null,
        },
        model: "rules-keyword-analysis-v1",
        source: "rules",
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    };
    expect(isRelevantRelatedKeyword("철제골무", ironThimble)).toBe(true);
    expect(isRelevantRelatedKeyword("고무골무", ironThimble)).toBe(false);
  });

  it("공백·특수문자 차이와 높은 토큰 중복을 유사 상품명으로 찾는다", () => {
    expect(isSimilarProductTitle("철제 바느질 골무", "철제-바느질 골무")).toBe(true);
    expect(isSimilarProductTitle("여성 린넨 여름 원피스", "여성 린넨 원피스")).toBe(false);
    expect(isSimilarProductTitle("철제 골무", "실리콘 골무")).toBe(false);
  });

  it("본인 스토어 링크에서 카테고리·속성·태그를 가져와 원본 공급사명을 보존한다", async () => {
    const repository = fakeRepository();
    const importer = {
      import: vi.fn().mockResolvedValue({
        currentTitle: "네이버 판매용 린넨 원피스",
        categoryId: "50000805",
        category: "패션의류>여성의류>원피스",
        attributes: [
          {
            attributeSeq: 10,
            attributeName: "소재",
            attributeValueSeq: 100,
            value: "린넨",
          },
        ],
        searchTags: ["여름원피스"],
        materials: ["린넨"],
        colors: [],
        sizes: [],
        target: "여성",
        seasons: ["여름"],
      }),
    };
    const service = new KeywordManagementService(
      repository,
      null,
      null,
      config,
      importer,
    );

    const input = createInput("공급사 원본 원피스");
    input.productInput.category = "";
    await service.create("owner-1", input);

    expect(importer.import).toHaveBeenCalledWith("1234567890");
    expect(repository.create).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({
        productInput: expect.objectContaining({
          supplierTitle: "공급사 원본 원피스",
          currentTitle: "네이버 판매용 린넨 원피스",
          category: "패션의류>여성의류>원피스",
          naverCategoryId: "50000805",
          materials: ["린넨"],
          searchTags: ["여름원피스"],
          commerceImport: expect.objectContaining({ status: "success" }),
        }),
      }),
    );
  });

  it("커머스 상품 조회가 실패해도 수동 입력값으로 상품 추가를 계속한다", async () => {
    const repository = fakeRepository();
    const importer = { import: vi.fn().mockRejectedValue(new Error("offline")) };
    const service = new KeywordManagementService(
      repository,
      null,
      null,
      config,
      importer,
    );

    await service.create("owner-1", createInput("수동 상품명"));

    expect(repository.create).toHaveBeenCalledWith(
      "owner-1",
      expect.objectContaining({
        productInput: expect.objectContaining({
          supplierTitle: "수동 상품명",
          category: "수동 카테고리",
          commerceImport: expect.objectContaining({ status: "failed" }),
        }),
      }),
    );
  });
});

function createInput(supplierTitle: string) {
  return {
    smartstoreUrl: "https://smartstore.naver.com/sample/products/1234567890",
    productInput: {
      supplierTitle,
      currentTitle: "",
      description: "",
      category: "수동 카테고리",
      features: [],
      materials: [],
      colors: [],
      sizes: [],
      target: "",
      seasons: [],
      supplierUrl: "",
      imageUrls: [],
      memo: "",
    },
  };
}

const config = {
  candidateCount: 30,
  cacheHours: 24,
  titleMaximumLength: 60,
  mockMode: false,
};
const keywordId = "11111111-1111-4111-8111-111111111111";
const otherKeywordId = "22222222-2222-4222-8222-222222222222";

function fakeRepository(): KeywordManagementRepository {
  return {
    list: vi.fn().mockResolvedValue([]),
    find: vi.fn().mockResolvedValue(detail),
    findLocalPublication: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue({ id: "product-1" }),
    updateProductInput: vi.fn().mockResolvedValue(true),
    saveAnalysis: vi.fn().mockResolvedValue(undefined),
    addKeywordCandidates: vi.fn().mockResolvedValue(undefined),
    replaceKeywordCandidates: vi.fn().mockResolvedValue(undefined),
    updateKeywordReviewStatus: vi.fn().mockResolvedValue(true),
    updateAnalysis: vi.fn().mockResolvedValue(true),
    findCachedMetrics: vi.fn().mockResolvedValue([]),
    cacheMetrics: vi.fn().mockResolvedValue(undefined),
    applyMetrics: vi.fn().mockResolvedValue(undefined),
    saveSelection: vi.fn().mockResolvedValue(["여성 원피스", "여성 린넨 원피스"]),
    createTitle: vi.fn().mockResolvedValue({ id: "title-1", editedTitle: "초안" }),
    updateTitle: vi.fn().mockResolvedValue(true),
    saveFinalTitle: vi.fn().mockResolvedValue(true),
  };
}

const detail: ManagedProductDetail = {
  product: {
    id: "product-1",
    smartstoreUrl: "https://smartstore.naver.com/sample/products/1234567890",
    channelProductNo: "1234567890",
    linkedProductId: null,
    supplierTitle: "여성 원피스",
    currentTitle: null,
    editableTitle: "여성 원피스",
    finalTitle: null,
    productInput: {
      supplierTitle: "여성 원피스",
      description: "여름 원피스",
      category: "원피스",
      features: [],
      materials: [],
      colors: [],
      sizes: [],
      target: "여성",
      seasons: ["여름"],
      supplierUrl: "",
      imageUrls: [],
      memo: "",
    },
    status: "analyzed",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  },
  analysis: null,
  keywords: [
    candidate(keywordId, "여성 원피스"),
    candidate(otherKeywordId, "여성 린넨 원피스"),
  ],
  titles: [],
};

function candidate(id: string, keyword: string) {
  return {
    id,
    keyword,
    normalizedKeyword: keyword,
    recommendationReason: "",
    sourceConcepts: [],
    recommendationOrder: 0,
    origin: "rule_combination" as const,
    reviewStatus: "candidate" as const,
    filterReasons: [],
    relevanceScore: null,
    monthlyPcSearchVolume: null,
    monthlyMobileSearchVolume: null,
    totalMonthlySearchVolume: null,
    rawMonthlyPcSearchVolume: null,
    rawMonthlyMobileSearchVolume: null,
    competition: "unknown" as const,
    keywordSize: "unclassified" as const,
    metricsStatus: "pending" as const,
    metricsSource: null,
    metricsFetchedAt: null,
    isSelected: false,
  };
}

function metric(
  keyword: string,
  status: KeywordMetrics["status"],
  total: number | null,
): KeywordMetrics {
  return {
    keyword,
    monthlyPcSearchVolume: total == null ? null : 300,
    monthlyMobileSearchVolume: total == null ? null : total - 300,
    totalMonthlySearchVolume: total,
    rawMonthlyPcSearchVolume: total == null ? null : 300,
    rawMonthlyMobileSearchVolume: total == null ? null : total - 300,
    competition: total == null ? "unknown" : "medium",
    fetchedAt: "2026-01-01T00:00:00.000Z",
    source: "naver-search-ad",
    status,
  };
}
