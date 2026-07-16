// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Link from "next/link";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductEditorDrawer } from "@/app/admin/products/[id]/edit/product-editor-drawer";

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("상품 편집 서랍", () => {
  it("목록을 다시 탐색하지 않고 즉시 로딩 서랍을 연 뒤 상세만 가져온다", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
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
        <ProductEditorDrawer categories={[]} />
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
      Response.json({
        success: true,
        data: {
          product: {
            id: "drawer-test-product",
            status: "draft",
            title: "빠른 편집 상품",
            searchTags: [],
            sellingPrice: null,
            currency: "KRW",
            description: "",
            categoryId: null,
            selectedImages: [],
            editedOptions: { groups: [], combinations: [] },
            draftVersion: 1,
            updatedAt: new Date().toISOString(),
          },
          supplier: {
            name: "친구도매",
            externalProductId: "drawer-test-product",
            originalName: "원본 상품",
            supplierPrice: "1000.00",
            currency: "KRW",
            availability: "active",
            originalImages: [],
            originalOptions: [],
            lastSyncedAt: new Date().toISOString(),
          },
        },
      }),
    );

    await waitFor(() =>
      expect(screen.getByText("빠른 편집 상품")).toBeInTheDocument(),
    );
  });
});
