// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductTitleInlineEditor } from "@/app/admin/products/product-title-inline-editor";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("상품 목록 제목 빠른 편집", () => {
  it("입력창 밖을 클릭하면 버튼 없이 변경한 제목을 저장한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        success: true,
        data: { product: { title: "바뀐 상품명", draftVersion: 4 } },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProductTitleInlineEditor
        id="product-1"
        initialTitle="기존 상품명"
        initialDraftVersion={3}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "기존 상품명" }));
    const input = screen.getByRole("textbox", { name: "상품명" });
    fireEvent.change(input, { target: { value: "바뀐 상품명" } });
    expect(
      screen.queryByRole("button", { name: "저장" }),
    ).not.toBeInTheDocument();
    fireEvent.blur(input);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/products/product-1/title",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ title: "바뀐 상품명", draftVersion: 3 }),
      }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "바뀐 상품명" }),
      ).toBeInTheDocument(),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
