// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProductKeywordReuse } from "@/app/admin/products/product-keyword-reuse";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const products = [{ id: "source", title: "기준" }, { id: "one", title: "첫 상품" }, { id: "two", title: "둘째 상품" }];
it("부분 실패 후 성공한 상품은 제외하고 실패 상품만 재시도한다", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ sourceVersion: 1, sourceTitle: "기준", previews: products.slice(1).map(p => ({ ...p, draftVersion: 2, previousKeywordCount: 0, nextKeywordCount: 3, categoryChanges: false })) }))
    .mockResolvedValueOnce(Response.json({ success: true }))
    .mockResolvedValueOnce(Response.json({ error: { message: "일시 실패" } }, { status: 503 }))
    .mockResolvedValueOnce(Response.json({ success: true }));
  vi.stubGlobal("fetch", fetchMock);
  render(<ProductKeywordReuse products={products} />);
  fireEvent.click(screen.getByText("선택 상품군에 엑셀 키워드 재사용"));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "source" } });
  fireEvent.click(screen.getByRole("button", { name: "변경 미리보기" }));
  fireEvent.click(await screen.findByRole("button", { name: "확인한 2개에 적용" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("일시 실패"));
  fireEvent.click(screen.getByRole("button", { name: "확인한 1개에 적용" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4));
  expect(JSON.parse(fetchMock.mock.calls[3][1].body).targetId).toBe("two");
  await waitFor(() => expect(screen.queryByRole("button", { name: /확인한/ })).not.toBeInTheDocument());
});
it("옵션을 바꾸면 이전 미리보기로 적용할 수 없다", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ sourceVersion: 1, previews: [] })));
  render(<ProductKeywordReuse products={products} />);
  fireEvent.click(screen.getByText("선택 상품군에 엑셀 키워드 재사용"));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "source" } });
  fireEvent.click(screen.getByRole("button", { name: "변경 미리보기" }));
  await screen.findByRole("button", { name: "확인한 0개에 적용" });
  fireEvent.click(screen.getByLabelText("검색 태그도 교체"));
  expect(screen.queryByRole("button", { name: /확인한/ })).not.toBeInTheDocument();
});
