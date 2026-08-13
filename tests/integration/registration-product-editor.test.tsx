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
  it("상품명 키워드를 여러 개 선택하고 자동 연결 실패 후보도 추천에 반영한다", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(editorResponse());
    vi.stubGlobal("fetch", fetchMock);

    render(
      <RegistrationProductEditor
        productId="00000000-0000-4000-8000-000000000010"
        registrationContext={registrationContext()}
      />,
    );

    const unconnectedKeyword = await screen.findByRole("checkbox", {
      name: "두부탈수기 추천 상품명 키워드 선택",
    });
    expect(screen.getByText("자동 연결 확인 필요 (1)")).toBeVisible();
    expect(unconnectedKeyword.closest("label")).toHaveTextContent(
      "두부탈수기",
    );
    expect(unconnectedKeyword.closest("label")).toHaveTextContent(
      "자동 연결 실패, 직접 선택 가능",
    );
    expect(unconnectedKeyword).not.toBeChecked();
    fireEvent.click(unconnectedKeyword);
    expect(unconnectedKeyword).toBeChecked();
    expect(screen.getByText(/3개 선택/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "상품명 추천" }));

    expect(screen.getByText("소싱 분류 + 검색 품질 규칙")).toBeVisible();
    expect(
      screen.getByText("두부탈수기 미끄럼방지 물빠짐 욕실화"),
    ).toBeVisible();
    expect(
      screen.getByText("추천에 사용한 상품명 키워드 (3개)"),
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
    expect(screen.getByText("월 검색수 700")).toBeVisible();
    expect(
      screen.getByText(/월 검색수 1,000은 상품명 후보 기준이며/),
    ).toBeVisible();
    expect(
      screen.getByText(/월 검색수 12,000 · 1,000 초과도 선택 가능/),
    ).toBeVisible();
    expect(screen.getByText("검색 태그 선택 (1/10)")).toBeVisible();
    expect(bathroomTag).toBeChecked();
    expect(highVolumeTag).not.toBeChecked();
    expect(highVolumeTag).toBeEnabled();

    fireEvent.click(highVolumeTag);
    await waitFor(() => expect(highVolumeTag).toBeChecked());
  });

  it("상품명과 중복되는 검색수 1,000 초과 태그도 직접 선택한다", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(editorResponse()));

    render(
      <RegistrationProductEditor
        productId="00000000-0000-4000-8000-000000000010"
        registrationContext={registrationContext()}
      />,
    );

    const duplicateHighVolumeTag = await screen.findByRole("checkbox", {
      name: /욕실화.*월 검색수 20,000.*상품명과 중복.*직접 선택 가능/,
    });
    expect(duplicateHighVolumeTag).not.toBeChecked();
    expect(duplicateHighVolumeTag).toBeEnabled();

    fireEvent.click(duplicateHighVolumeTag);
    await waitFor(() => expect(duplicateHighVolumeTag).toBeChecked());
  });

  it("카테고리 필수속성 조회 실패 후 다시 불러와 입력란을 표시한다", async () => {
    let requirementsAttempts = 0;
    const fetchMock = vi.fn().mockImplementation((
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      const url = String(input);
      if (url.startsWith("/api/products/")) {
        if (
          url.endsWith("/naver-delivery-policy") &&
          init?.method === "PATCH"
        ) {
          return Promise.resolve(
            Response.json({
              success: true,
              policy: {
                id: "22222222-2222-4222-8222-222222222222",
                policyCode: "000001",
                name: "기본 무료배송",
              },
            }),
          );
        }
        if (url.endsWith("/naver-publication")) {
          return Promise.resolve(
            Response.json({
              success: true,
              inspection: {
                ready: false,
                issues: [],
                publication: null,
              },
            }),
          );
        }
        return Promise.resolve(editorResponse());
      }
      if (url.startsWith("/api/integrations/naver/category-requirements")) {
        requirementsAttempts += 1;
        if (requirementsAttempts <= 2) {
          return Promise.resolve(
            Response.json(
              {
                success: false,
                error: { message: "카테고리 필수정보를 조회하지 못했습니다." },
              },
              { status: 500 },
            ),
          );
        }
        return Promise.resolve(
          Response.json({
            success: true,
            requirements: {
              categoryId: "50001799",
              attributes: [
                {
                  attributeSeq: 100,
                  attributeName: "주요소재",
                  attributeClassificationType: "SINGLE_SELECT",
                },
              ],
              requiredAttributes: [
                {
                  attributeSeq: 100,
                  attributeName: "주요소재",
                  attributeClassificationType: "SINGLE_SELECT",
                },
              ],
              attributeValues: [
                {
                  attributeSeq: 100,
                  attributeValueSeq: 200,
                  minAttributeValue: "EVA",
                },
              ],
              units: [],
              standardOptions: {
                useStandardOption: false,
                standardOptionCategoryGroups: [],
              },
              requiredOptionGroups: [],
              stale: false,
            },
          }),
        );
      }
      if (url.startsWith("/api/integrations/naver/provided-notices")) {
        return Promise.resolve(
          Response.json({ success: true, notices: [] }),
        );
      }
      if (url.startsWith("/api/integrations/naver/delivery-options")) {
        return Promise.resolve(
          Response.json({
            success: true,
            data: {
              releaseAddresses: [],
              returnAddresses: [],
              bundleGroups: [],
              returnDeliveryCompanies: [],
            },
          }),
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <RegistrationProductEditor
        productId="00000000-0000-4000-8000-000000000010"
        registrationContext={registrationContext()}
      />,
    );

    await screen.findByDisplayValue("물빠짐 미끄럼방지 욕실화");
    fireEvent.click(screen.getByRole("button", { name: /속성/ }));
    const retry = await screen.findByRole("button", {
      name: "카테고리 필수속성 다시 불러오기",
    });
    fireEvent.click(retry);

    expect(
      await screen.findByRole("combobox", { name: "주요소재" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /스마트스토어/ }));
    fireEvent.change(
      screen.getByRole("combobox", { name: "배송정책 관리번호" }),
      {
        target: { value: "22222222-2222-4222-8222-222222222222" },
      },
    );
    await screen.findByText(
      "배송정책 000001 · 기본 무료배송을 선택했습니다.",
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/products/00000000-0000-4000-8000-000000000010/naver-delivery-policy",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          deliveryPolicyId: "22222222-2222-4222-8222-222222222222",
        }),
      }),
    );
    expect(requirementsAttempts).toBe(3);
  });
});

function registrationContext(): SourcingRegistrationContext {
  return {
    researchId: "00000000-0000-4000-8000-000000000001",
    sourcingKeyword: "욕실화",
    relatedKeywords: [
      keyword("물빠짐욕실화", 900, "product_name"),
      keyword("미끄럼방지욕실화", 400, "product_name"),
      keyword("두부탈수기", 360, "product_name"),
      keyword("욕실화", 20_000, "tag"),
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
        defaults: emptyPublicationPolicy(),
        overrides: {},
        effective: emptyPublicationPolicy(),
        deliveryPolicy: null,
      },
      naverDeliveryPolicies: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          policyCode: "000001",
          name: "기본 무료배송",
        },
      ],
      naverStoreConnections: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          storeName: "테스트 스토어",
          storeUrl: "https://smartstore.naver.com/test",
          authType: "SELF",
          accountId: null,
          isDefault: true,
        },
      ],
      naverStoreConnectionId: "11111111-1111-4111-8111-111111111111",
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

function emptyPublicationPolicy() {
  return {
    singleStockQuantity: null,
    deliveryInfo: null,
    afterServiceInfo: null,
    originAreaInfo: null,
    productInfoProvidedNotice: null,
    taxType: null,
    minorPurchasable: null,
    naverShoppingRegistration: null,
    channelProductDisplayStatusType: null,
  };
}
