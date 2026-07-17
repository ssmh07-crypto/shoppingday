// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProductSettingsForm } from "@/app/admin/settings/products/product-settings-form";

afterEach(() => vi.unstubAllGlobals());

describe("상품 처리 설정", () => {
  it("변동처리 보호 항목과 상품명 적용 기본값을 함께 저장한다", async () => {
    const saved = {
      syncProtectedFields: ["description", "images", "options"],
      applyCategoryQueryToTitleByDefault: true,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ success: true, settings: saved }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ProductSettingsForm
        initial={{
          syncProtectedFields: ["title", "description", "images", "options"],
          applyCategoryQueryToTitleByDefault: false,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: "상품명" }));
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "정리된 검색어를 상품명에도 적용",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "설정 저장" }));

    await waitFor(() => expect(screen.getByText("저장했습니다.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/settings/products",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify(saved),
      }),
    );
  });
});
