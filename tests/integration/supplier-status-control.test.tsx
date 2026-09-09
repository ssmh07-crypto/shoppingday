// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SupplierStatusControl } from "@/app/admin/products/changes/supplier-status-control";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("미확인 상태를 품절이나 단종으로 반영하지 않는다", () => {
  render(<SupplierStatusControl productId="one" title="상품" availability="unknown" />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
it("단종 반영은 확인 후 판매 중지로 요청하고 최신 공급상태 조건을 전달한다", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ success: true })); vi.stubGlobal("fetch", fetchMock);
  render(<SupplierStatusControl productId="one" title="상품" availability="discontinued" />);
  fireEvent.click(screen.getByRole("button", { name: "선택 스토어 판매 중지 반영" }));
  await screen.findByText("판매 중지 반영 완료");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ confirmed: true, statusType: "SUSPENSION", expectedSupplierAvailability: "discontinued" });
});
