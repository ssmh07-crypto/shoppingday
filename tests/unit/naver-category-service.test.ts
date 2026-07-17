import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { NaverCategoryRepository } from "@/modules/channels/naver/naver-category-repository";
import { NaverCategoryService } from "@/modules/channels/naver/naver-category-service";
import type { NaverCategoriesClient } from "@/modules/channels/naver/naver-commerce-relay";

const category = {
  id: "50000805",
  name: "원피스",
  wholeCategoryName: "패션의류>여성의류>원피스",
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
    });
    expect(repository.recommendFromTitle).toHaveBeenCalledWith(
      "여성 여름 원피스",
    );
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
