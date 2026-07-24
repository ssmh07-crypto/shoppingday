// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RegistrationProductEditor } from "@/app/admin/registration/[id]/edit/registration-product-editor";
import type { SourcingRegistrationContext } from "@/app/admin/products/[id]/edit/product-editor-types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("소싱 상품 등록 전용 편집", () => {
  it("기준 상품명 후보로 추천 순서를 바꾸고 태그를 직접 선택한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(editorResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(
      <RegistrationProductEditor
        productId="00000000-0000-4000-8000-000000000010"
        registrationContext={registrationContext()}
      />,
    );

    const basis = await screen.findByRole("combobox", {
      name: /기준 상품명 검색어/,
    });
    fireEvent.change(basis, { target: { value: "미끄럼방지욕실화" } });
    fireEvent.click(screen.getByRole("button", { name: "상품명 추천" }));

    expect(screen.getByText("소싱 분류 + 검색 품질 규칙")).toBeVisible();
    expect(screen.getByText("미끄럼방지 물빠짐 욕실화")).toBeVisible();
    expect(
      screen.getByText("추천에 사용한 상품명 키워드 (2개)"),
    ).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const sellingTitle = screen.getByLabelText("판매용 상품명");
    expect(sellingTitle).toHaveAttribute("maxlength", "50");
    fireEvent.change(sellingTitle, {
      target: { value: "가".repeat(41) },
    });
    expect(screen.getByText(/40자를 넘었습니다/)).toBeVisible();

    const bathroomTag = screen.getByRole("checkbox", {
      name: /욕실슬리퍼/,
    });
    const highVolumeTag = screen.getByRole("checkbox", {
      name: /화장실슬리퍼/,
    });
    expect(bathroomTag).toBeChecked();
    expect(highVolumeTag).not.toBeChecked();

    fireEvent.click(highVolumeTag);
    await waitFor(() => expect(highVolumeTag).toBeChecked());
  });
});

function registrationContext(): SourcingRegistrationContext {
  return {
    researchId: "00000000-0000-4000-8000-000000000001",
    sourcingKeyword: "욕실화",
    relatedKeywords: [
      keyword("물빠짐욕실화", 900, "product_name"),
      keyword("미끄럼방지욕실화", 400, "product_name"),
      keyword("욕실슬리퍼", 700, "tag"),
      keyword("화장실슬리퍼", 12_000, "tag"),
    ],
  };
}

function keyword(
  value: string,
  monthlySearchVolume: number,
  placement: "product_name" | "tag",
) {
  return {
    id: crypto.randomUUID(),
    keyword: value,
    normalizedKeyword: value.replace(/\s+/g, ""),
    monthlySearchVolume,
    placement,
    source: "itemscout-xlsx" as const,
    importedAt: "2026-07-19T00:00:00.000Z",
  };
}

function editorResponse() {
  return Response.json({
    success: true,
    data: {
      settings: {
        syncProtectedFields: ["title", "description", "images", "options"],
        applyCategoryQueryToTitleByDefault: false,
      },
      naverPublicationPolicy: {
        defaults: {},
        overrides: {},
        effective: {},
      },
      product: {
        id: "00000000-0000-4000-8000-000000000010",
        status: "draft",
        title: "물빠짐 미끄럼방지 욕실화",
        searchTags: ["욕실슬리퍼"],
        sellingPrice: 19900,
        currency: "KRW",
        description: "",
        categoryId: null,
        naverCategoryId: "50001799",
        selectedImages: [],
        editedOptions: { groups: [], combinations: [] },
        naverAttributes: [],
        draftVersion: 1,
        updatedAt: new Date().toISOString(),
      },
      naverCategory: {
        id: "50001799",
        name: "욕실화",
        wholeCategoryName: "생활/건강>욕실용품>욕실화",
      },
      supplier: {
        name: "소싱 아이템",
        externalProductId: "SC000001",
        originalName: "욕실화",
        supplierPrice: "2900.00",
        currency: "KRW",
        availability: "active",
        originalImages: [],
        originalOptions: [],
        lastSyncedAt: new Date().toISOString(),
      },
    },
  });
}
