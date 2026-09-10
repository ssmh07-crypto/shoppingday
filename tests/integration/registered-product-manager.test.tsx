// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RegisteredProductManager } from "@/app/admin/products/registered/registered-product-manager";
import type { RegisteredProductManagementRow } from "@/modules/products/registered-product-management";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const row: RegisteredProductManagementRow = {
  productId: "11111111-1111-4111-8111-111111111111",
  publicationId: "22222222-2222-4222-8222-222222222222",
  title: "등록 상품",
  sellingPrice: 20_000,
  supplierCode: "dome",
  supplierName: "친구도매",
  externalProductId: "100",
  originalName: "공급처 상품",
  supplierPrice: "10000",
  availability: "sold_out",
  lastSyncedAt: new Date("2026-09-10T00:00:00Z"),
  originProductNo: "300",
  channelProductNo: "400",
  remoteStatusType: "SALE",
  needsSoldOut: true,
  needsDiscontinued: false,
  needsPrice: true,
  needsDescription: false,
  targetPrice: 22_000,
};

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  refresh.mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("등록상품관리 반영 범위", () => {
  it("상품 행의 가격 버튼은 해당 상품만 가격 반영 API에 전달한다", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ result: { status: "succeeded" } }))
      .mockResolvedValueOnce(Response.json({ result: { status: "idle" } }));
    vi.stubGlobal("fetch", fetcher);
    render(
      <RegisteredProductManager rows={[row]} supplier="dome" need="all" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "가격 반영" }));

    await screen.findByText(/1건 처리 완료/);
    expect(fetcher.mock.calls[0][0]).toBe(
      "/api/products/supplier-price-applications",
    );
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      confirmed: true,
      supplierCode: "dome",
      productIds: [row.productId],
    });
  });

  it("조회 조건 전체 반영은 상품 ID 없이 현재 도매처와 작업 종류를 전달한다", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ result: { status: "idle" } }));
    vi.stubGlobal("fetch", fetcher);
    render(
      <RegisteredProductManager rows={[row]} supplier="dome" need="price" />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "조회 조건 전체 반영" }),
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      confirmed: true,
      supplierCode: "dome",
    });
  });
});
