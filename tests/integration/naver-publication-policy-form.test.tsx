// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      if (String(input).includes("delivery-options")) {
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

  it("스마트스토어 주소록과 반품 택배사를 선택해 배송 정책으로 저장한다", async () => {
    let savedBody: Record<string, unknown> | undefined;
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("provided-notices")) {
          return Response.json({ success: true, data: [] });
        }
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
              bundleGroups: [
                { id: 303, name: "기본 묶음배송", baseGroup: true },
              ],
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
        savedBody = JSON.parse(String(init?.body));
        return Response.json({
          success: true,
          policy: savedBody,
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NaverPublicationPolicyForm
        mode="default"
        endpoint="/api/settings/channels/naver"
        initialDefaults={emptyNaverPublicationPolicy}
      />,
    );

    await screen.findByText("스마트스토어 배송 정보를 불러왔습니다.");
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
    fireEvent.change(screen.getByLabelText("반품 배송비"), {
      target: { value: "3000" },
    });
    fireEvent.change(screen.getByLabelText("교환 배송비"), {
      target: { value: "6000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "기본 정책 저장" }));

    await waitFor(() => expect(savedBody).toBeDefined());
    expect(savedBody?.deliveryInfo).toMatchObject({
      deliveryType: "DELIVERY",
      deliveryAttributeType: "NORMAL",
      deliveryCompany: "HANJIN",
      claimDeliveryInfo: {
        shippingAddressId: 101,
        returnAddressId: 202,
        returnDeliveryCompanyPriorityType: "PRIMARY",
        returnDeliveryFee: 3000,
        exchangeDeliveryFee: 6000,
      },
    });
  });

  it("기본정책 상속 중에도 스토어 배송정보를 조회하고 선택할 수 있다", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      if (String(input).includes("provided-notices")) {
        return Promise.resolve(Response.json({ success: true, data: [] }));
      }
      return Promise.resolve(
        Response.json({
          success: true,
          data: {
            releaseAddresses: [
              {
                addressBookNo: 101,
                name: "네이버 기본 출고지",
                addressType: "RELEASE",
                address: "서울시 테스트구",
                baseAddress: "",
                detailAddress: "",
              },
            ],
            returnAddresses: [],
            bundleGroups: [],
            returnDeliveryCompanies: [],
          },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NaverPublicationPolicyForm
        mode="product"
        endpoint="/api/products/product-1/naver-publication-policy"
        initialDefaults={emptyNaverPublicationPolicy}
        initialOverrides={{}}
      />,
    );

    expect(await screen.findByText("출고지 1개")).toBeInTheDocument();
    const releaseAddress = screen.getByLabelText("출고지");
    expect(releaseAddress).not.toBeDisabled();
    fireEvent.change(releaseAddress, { target: { value: "101" } });
    expect(releaseAddress).toHaveValue("101");

    const deliveryField = releaseAddress.closest(".naver-policy-field");
    expect(
      deliveryField?.querySelector<HTMLInputElement>('input[type="checkbox"]'),
    ).toBeChecked();
  });
});
