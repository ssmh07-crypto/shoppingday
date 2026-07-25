// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NaverDeliveryPolicyManager } from "@/app/admin/channels/naver/naver-delivery-policy-manager";
import { NaverPublicationPolicyForm } from "@/app/admin/components/naver-publication-policy-form";
import { emptyNaverPublicationPolicy } from "@/modules/channels/naver/naver-publication-policy";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("네이버 판매 정책 설정", () => {
  it("빈 필드는 유지하고 관리자가 선택한 기본 정책만 저장한다", async () => {
    const saved = { ...emptyNaverPublicationPolicy, taxType: "TAX" as const };
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("provided-notices")) {
        return Promise.resolve(Response.json({ success: true, data: [] }));
      }
      return Promise.resolve(Response.json({ success: true, policy: saved }));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NaverPublicationPolicyForm
        mode="default"
        endpoint="/api/settings/channels/naver"
        initialDefaults={emptyNaverPublicationPolicy}
      />,
    );

    fireEvent.change(screen.getAllByRole("combobox")[0]!, {
      target: { value: "TAX" },
    });
    fireEvent.click(screen.getByRole("button", { name: "기본 정책 저장" }));

    await waitFor(() =>
      expect(screen.getByText("네이버 판매 정책을 저장했습니다.")).toBeInTheDocument(),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/channels/naver",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify(saved) }),
    );
  });

  it("스토어 설정에서 주소록을 선택해 6자리 배송정책을 저장한다", async () => {
    let savedBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("delivery-options")) {
          return Response.json({
            success: true,
            data: {
              releaseAddresses: [
                {
                  addressBookNo: 101,
                  name: "기본 출고지",
                  addressType: "RELEASE",
                  address: "서울시 테스트구",
                  baseAddress: "",
                  detailAddress: "",
                },
              ],
              returnAddresses: [
                {
                  addressBookNo: 202,
                  name: "기본 반품지",
                  addressType: "REFUND_OR_EXCHANGE",
                  address: "서울시 반품구",
                  baseAddress: "",
                  detailAddress: "",
                },
              ],
              bundleGroups: [],
              returnDeliveryCompanies: [
                {
                  id: 404,
                  name: "한진택배",
                  returnDeliveryCompanyPriorityType: "PRIMARY",
                },
              ],
            },
          });
        }
        if (init?.method === "POST") {
          savedBody = JSON.parse(String(init.body));
          return Response.json(
            {
              success: true,
              policy: {
                id: "policy-1",
                storeConnectionId: "11111111-1111-4111-8111-111111111111",
                policyCode: "000001",
                ...savedBody,
              },
            },
            { status: 201 },
          );
        }
        return Response.json({ success: true, policies: [] });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NaverDeliveryPolicyManager
        stores={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            storeName: "테스트 스토어",
            isDefault: true,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "배송정책 추가" }));
    await screen.findByText("스마트스토어 배송 정보를 불러왔습니다.");
    fireEvent.change(screen.getByPlaceholderText("예: 기본 무료배송"), {
      target: { value: "기본 무료배송" },
    });
    fireEvent.change(screen.getByLabelText("발송 택배사"), {
      target: { value: "HANJIN" },
    });
    fireEvent.change(screen.getByLabelText("출고지"), {
      target: { value: "101" },
    });
    fireEvent.change(screen.getByLabelText("반품·교환지"), {
      target: { value: "202" },
    });
    fireEvent.change(screen.getByLabelText("반품 택배사 계약"), {
      target: { value: "PRIMARY" },
    });
    fireEvent.click(screen.getByRole("button", { name: "배송정책 저장" }));

    await screen.findByText("000001");
    expect(savedBody).toMatchObject({
      storeConnectionId: "11111111-1111-4111-8111-111111111111",
      name: "기본 무료배송",
      deliveryInfo: {
        deliveryCompany: "HANJIN",
        claimDeliveryInfo: {
          shippingAddressId: 101,
          returnAddressId: 202,
          returnDeliveryCompanyPriorityType: "PRIMARY",
        },
      },
    });
  });

  it("상품별 판매정책 폼에서는 배송정보를 직접 편집하지 않는다", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(Response.json({ success: true, data: [] })),
      ),
    );

    render(
      <NaverPublicationPolicyForm
        mode="product"
        endpoint="/api/products/product-1/naver-publication-policy"
        initialDefaults={emptyNaverPublicationPolicy}
        initialOverrides={{}}
      />,
    );

    expect(screen.queryByLabelText("출고지")).not.toBeInTheDocument();
    expect(screen.queryByText("배송 정책")).not.toBeInTheDocument();
  });
});
