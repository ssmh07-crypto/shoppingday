// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NaverDeliveryAddressBookManager } from "@/app/admin/channels/naver/naver-delivery-address-book-manager";
import { NaverDeliveryPolicyManager } from "@/app/admin/channels/naver/naver-delivery-policy-manager";
import { NaverPublicationPolicyForm } from "@/app/admin/components/naver-publication-policy-form";
import { emptyNaverPublicationPolicy } from "@/modules/channels/naver/naver-publication-policy";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("네이버 판매 정책 설정", () => {
  it("네이버가 발급한 배송 주소록 번호와 계약 정보를 표시한다", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            success: true,
            data: {
              releaseAddresses: [
                {
                  addressBookNo: 106005339,
                  name: "기본 출고지",
                  addressType: "RELEASE",
                  address: "서울시 테스트구",
                  baseAddress: "",
                  detailAddress: "",
                },
              ],
              returnAddresses: [
                {
                  addressBookNo: 106005342,
                  name: "기본 반품지",
                  addressType: "REFUND_OR_EXCHANGE",
                  address: "서울시 반품구",
                  baseAddress: "",
                  detailAddress: "",
                },
              ],
              bundleGroups: [
                {
                  id: 53968255,
                  name: "기본 배송비 묶음그룹",
                  baseGroup: true,
                },
              ],
              returnDeliveryCompanies: [
                {
                  id: 1,
                  name: "한진택배",
                  returnDeliveryCompanyPriorityType: "PRIMARY",
                },
              ],
            },
          }),
        ),
      ),
    );

    render(
      <NaverDeliveryAddressBookManager
        stores={[
          {
            id: "11111111-1111-4111-8111-111111111111",
            storeName: "테스트 스토어",
            isDefault: true,
          },
        ]}
      />,
    );

    await screen.findByText("네이버 배송 주소록을 불러왔습니다.");
    expect(screen.getByText("106005339")).toBeVisible();
    expect(screen.getByText("106005342")).toBeVisible();
    expect(screen.getByText("53968255")).toBeVisible();
    expect(screen.getByText("PRIMARY")).toBeVisible();
  });

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
        if (url.includes("delivery-policy-from-product")) {
          return Response.json({
            success: true,
            data: {
              channelProductNo: "1234567890",
              productName: "기존 판매 상품",
              deliveryInfo: {
                deliveryType: "DELIVERY",
                deliveryAttributeType: "NORMAL",
                deliveryCompany: "HANJIN",
                deliveryBundleGroupUsable: false,
                deliveryFee: {
                  deliveryFeeType: "FREE",
                  baseFee: 0,
                  deliveryFeePayType: "PREPAID",
                  deliveryFeeByArea: {
                    deliveryAreaType: "AREA_2",
                    area2extraFee: 3000,
                    area3extraFee: 0,
                  },
                },
                claimDeliveryInfo: {
                  returnDeliveryCompanyPriorityType: "PRIMARY",
                  returnDeliveryFee: 3000,
                  exchangeDeliveryFee: 6000,
                  shippingAddressId: 101,
                  returnAddressId: 202,
                  freeReturnInsuranceYn: false,
                },
              },
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
    fireEvent.change(screen.getByPlaceholderText("상품 링크 또는 채널상품번호"), {
      target: {
        value:
          "https://smartstore.naver.com/sample/products/1234567890",
      },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "기존 배송정책 불러오기" }),
    );
    await screen.findByText(/채널상품번호 1234567890의 배송정책/);
    expect(screen.getByPlaceholderText("예: 기본 무료배송")).toHaveValue(
      "기존 판매 상품 배송정책",
    );
    expect(screen.getByLabelText("출고지")).toHaveValue("101");
    expect(screen.getByLabelText("반품·교환지")).toHaveValue("202");
    fireEvent.click(screen.getByRole("button", { name: "배송정책 저장" }));

    await screen.findByText("000001");
    expect(savedBody).toMatchObject({
      storeConnectionId: "11111111-1111-4111-8111-111111111111",
      name: "기존 판매 상품 배송정책",
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
