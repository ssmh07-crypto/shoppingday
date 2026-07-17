import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { NaverCategoryRepository } from "@/modules/channels/naver/naver-category-repository";
import {
  categoryRuleIds,
  NaverCategoryService,
  rankCatalogCategories,
} from "@/modules/channels/naver/naver-category-service";
import type { NaverCategoriesClient } from "@/modules/channels/naver/naver-commerce-relay";

const category = {
  id: "50000805",
  name: "원피스",
  wholeCategoryName: "패션의류>여성의류>원피스",
  last: true,
};
const capsuleStorageCategory = {
  id: "50005257",
  name: "기타보관용기",
  wholeCategoryName: "생활/건강>주방용품>보관/밀폐용기>기타보관용기",
  last: true,
};

function setup(
  fetchProductModels: ReturnType<typeof vi.fn>,
  localRecommendation: typeof category | null = null,
) {
  const repository = {
    findLeafByIds: vi.fn().mockResolvedValue([category]),
    recommendFromTitle: vi.fn().mockResolvedValue(localRecommendation),
  };
  const client = {
    fetchCategories: vi.fn(),
    fetchProductModels,
  };
  return {
    service: new NaverCategoryService(
      repository as unknown as NaverCategoryRepository,
      client as unknown as NaverCategoriesClient,
    ),
    repository,
    client,
  };
}

describe("네이버 카테고리 자동 추천", () => {
  it("정확한 검색 결과가 없으면 수식어를 줄여 카탈로그 다수 카테고리를 적용한다", async () => {
    const fetchProductModels = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        model(1, capsuleStorageCategory.id),
        model(2, capsuleStorageCategory.id),
      ]);
    const { service, repository } = setup(fetchProductModels);
    repository.findLeafByIds.mockResolvedValueOnce([capsuleStorageCategory]);

    await expect(
      service.recommend("나선형 캡슐커피 보관 디스펜서"),
    ).resolves.toEqual({
      category: capsuleStorageCategory,
      source: "naver_catalog",
      evidence: {
        votes: 2,
        sampleSize: 2,
        query: "캡슐커피 보관 디스펜서",
      },
    });
    expect(fetchProductModels).toHaveBeenNthCalledWith(
      1,
      "나선형 캡슐커피 보관 디스펜서",
      30,
    );
    expect(fetchProductModels).toHaveBeenNthCalledWith(
      2,
      "캡슐커피 보관 디스펜서",
      30,
    );
    expect(repository.findLeafByIds).toHaveBeenCalledWith(["50005257"]);
    expect(repository.recommendFromTitle).not.toHaveBeenCalled();
  });

  it("먹는 캡슐커피 상품에는 보관용품 규칙을 적용하지 않는다", () => {
    expect(categoryRuleIds("에스프레소 캡슐커피 10개입")).toEqual([]);
    expect(categoryRuleIds("커피 캡슐 회전형 거치대")).toEqual(["50005257"]);
  });

  it("강한 로컬 일치가 없으면 네이버 카탈로그를 적용한다", async () => {
    const { service, repository } = setup(
      vi.fn().mockResolvedValue([
        {
          id: 1,
          name: "여성 여름 원피스",
          categoryId: category.id,
          wholeCategoryName: category.wholeCategoryName,
        },
      ]),
    );

    await expect(service.recommend("여성 여름 원피스")).resolves.toEqual({
      category,
      source: "naver_catalog",
      evidence: { votes: 1, sampleSize: 1 },
    });
    expect(repository.recommendFromTitle).toHaveBeenCalledWith(
      "여성 여름 원피스",
    );
  });

  it("카탈로그에서 가장 많이 등장한 카테고리를 우선한다", async () => {
    const otherCategoryId = "50000001";
    const models = [
      model(1, otherCategoryId),
      model(2, category.id),
      model(3, category.id),
      model(4, otherCategoryId),
      model(5, category.id),
    ];
    const { service, repository } = setup(vi.fn().mockResolvedValue(models));

    await expect(service.recommend("여성 여름 원피스")).resolves.toEqual({
      category,
      source: "naver_catalog",
      evidence: { votes: 3, sampleSize: 5 },
    });
    expect(repository.findLeafByIds).toHaveBeenCalledWith([
      category.id,
      otherCategoryId,
    ]);
  });

  it("득표수가 같으면 상위 1~3개에 먼저 등장한 카테고리를 우선한다", () => {
    const first = "50000001";
    const second = "50000002";
    expect(
      rankCatalogCategories([
        model(1, first),
        model(2, second),
        model(3, first),
        model(4, second),
      ]).map((item) => item.categoryId),
    ).toEqual([first, second]);
  });

  it("상품명과 강하게 일치하는 동기화 카테고리를 우선한다", async () => {
    const { service, repository, client } = setup(
      vi.fn().mockRejectedValue(new Error("relay unavailable")),
      category,
    );

    await expect(service.recommend("여성 여름 원피스")).resolves.toEqual({
      category,
      source: "local_index",
    });
    expect(repository.recommendFromTitle).toHaveBeenCalledWith(
      "여성 여름 원피스",
    );
    expect(repository.findLeafByIds).not.toHaveBeenCalled();
    expect(client.fetchProductModels).not.toHaveBeenCalled();
  });
});

function model(id: number, categoryId: string) {
  return {
    id,
    name: `상품 ${id}`,
    categoryId,
    wholeCategoryName: "대분류>중분류>소분류",
  };
}
