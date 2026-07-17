// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Link from "next/link";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductEditorDrawer } from "@/app/admin/products/[id]/edit/product-editor-drawer";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("상품 편집 서랍", () => {
  it("목록을 다시 탐색하지 않고 즉시 로딩 서랍을 연 뒤 상세만 가져온다", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          recommendation: {
            source: "naver_catalog",
            evidence: {
              votes: 1,
              sampleSize: 1,
              query: "정원 상품",
            },
            category: {
              id: "50001799",
              name: "정원부자재",
              wholeCategoryName: "생활/건강>정원/원예용품>정원부자재",
              last: true,
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <>
        <Link
          href="/admin/products?edit=drawer-test-product"
          data-product-editor-id="drawer-test-product"
        >
          편집
        </Link>
        <ProductEditorDrawer />
      </>,
    );

    fireEvent.click(screen.getByRole("link", { name: "편집" }));

    expect(
      screen.getByText("상품 정보를 불러오고 있습니다."),
    ).toBeInTheDocument();
    expect(window.location.search).toBe("?edit=drawer-test-product");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/products/drawer-test-product",
      expect.objectContaining({ cache: "no-store" }),
    );

    resolveFetch(
      editorResponse({
        id: "drawer-test-product",
        title: "빠른 편집 상품",
        originalName: "원본 상품",
        naverCategoryId: null,
        applyCategoryQueryToTitleByDefault: true,
      }),
    );

    await waitFor(() =>
      expect(screen.getByText("빠른 편집 상품")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText("정원부자재")).toBeInTheDocument(),
    );
    expect(screen.getByDisplayValue("정원 상품")).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: "정리된 검색어를 상품명에도 적용",
      }),
    ).toBeChecked();
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "정리된 검색어를 상품명에도 적용",
      }),
    );
    expect(screen.getByDisplayValue("빠른 편집 상품")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/integrations/naver/categories/recommend?productName=%EB%B9%A0%EB%A5%B8%20%ED%8E%B8%EC%A7%91%20%EC%83%81%ED%92%88",
    );
  });

  it("현재 목록 순서대로 이전 상품과 다음 상품을 연다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        editorResponse({ id: "product-2", title: "두 번째 상품" }),
      )
      .mockResolvedValueOnce(
        editorResponse({ id: "product-3", title: "세 번째 상품" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    window.history.replaceState(null, "", "/admin/products?edit=product-2");

    render(
      <ProductEditorDrawer
        initialProductId="product-2"
        productIds={["product-1", "product-2", "product-3"]}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("두 번째 상품")).toBeInTheDocument(),
    );
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다음 상품" }));

    await waitFor(() =>
      expect(screen.getByText("세 번째 상품")).toBeInTheDocument(),
    );
    expect(window.location.search).toBe("?edit=product-3");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/products/product-3",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("수동 자동 추천은 정리된 검색어로 판매용 상품명을 덮어쓴다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        editorResponse({
          id: "manual-recommendation-product",
          title: "수식어가 많은 원래 판매용 상품명",
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          recommendation: {
            source: "naver_catalog",
            evidence: { votes: 3, sampleSize: 3, query: "정리된 상품명" },
            category: {
              id: "50001799",
              name: "정원부자재",
              wholeCategoryName: "생활/건강>정원/원예용품>정원부자재",
              last: true,
            },
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProductEditorDrawer initialProductId="manual-recommendation-product" />,
    );

    await waitFor(() =>
      expect(
        screen.getByDisplayValue("수식어가 많은 원래 판매용 상품명"),
      ).toBeInTheDocument(),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "상품명으로 자동 추천" }),
    );

    await waitFor(() =>
      expect(screen.getByDisplayValue("정리된 상품명")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("checkbox", {
        name: "정리된 검색어를 상품명에도 적용",
      }),
    ).toBeChecked();
  });

  it("변경 후 다른 탭을 누르면 초안을 저장한 뒤 이동한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        editorResponse({ id: "autosave-product", title: "저장 전 상품명" }),
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          data: { product: { status: "editing", draftVersion: 2 } },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<ProductEditorDrawer initialProductId="autosave-product" />);

    const title = await screen.findByDisplayValue("저장 전 상품명");
    fireEvent.change(title, { target: { value: "자동 저장 상품명" } });
    fireEvent.click(screen.getByRole("button", { name: /이미지·상세/ }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenLastCalledWith(
        "/api/products/autosave-product/draft",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByText("상세페이지")).toBeInTheDocument(),
    );
  });
});

function editorResponse({
  id,
  title,
  originalName = "공급처 원본 상품",
  naverCategoryId = "50001799",
  applyCategoryQueryToTitleByDefault = false,
}: {
  id: string;
  title: string;
  originalName?: string;
  naverCategoryId?: string | null;
  applyCategoryQueryToTitleByDefault?: boolean;
}) {
  return Response.json({
    success: true,
    data: {
      settings: {
        syncProtectedFields: ["title", "description", "images", "options"],
        applyCategoryQueryToTitleByDefault,
      },
      product: {
        id,
        status: "draft",
        title,
        searchTags: [],
        sellingPrice: null,
        currency: "KRW",
        description: "",
        categoryId: null,
        naverCategoryId,
        selectedImages: [],
        editedOptions: { groups: [], combinations: [] },
        draftVersion: 1,
        updatedAt: new Date().toISOString(),
      },
      naverCategory: naverCategoryId
        ? {
            id: naverCategoryId,
            name: "정원부자재",
            wholeCategoryName: "생활/건강>정원/원예용품>정원부자재",
          }
        : null,
      supplier: {
        name: "친구도매",
        externalProductId: id,
        originalName,
        supplierPrice: "1000.00",
        currency: "KRW",
        availability: "active",
        originalImages: [],
        originalOptions: [],
        lastSyncedAt: new Date().toISOString(),
      },
    },
  });
}
