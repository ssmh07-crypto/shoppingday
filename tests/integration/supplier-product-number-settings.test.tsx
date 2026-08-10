// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierProductNumberSettings } from "@/app/admin/products/supplier-product-number-settings";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  refresh.mockReset();
});

describe("공급처 상품번호 규칙", () => {
  it("공급처별 접두사를 정규화해 저장한다", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        success: true,
        supplier: {
          code: "dome",
          name: "친구도매",
          productNumberPrefix: "FD",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(
      <SupplierProductNumberSettings
        suppliers={[
          { code: "zicgam", name: "직감", productNumberPrefix: "ZG" },
          { code: "dome", name: "친구도매", productNumberPrefix: null },
        ]}
      />,
    );

    fireEvent.click(screen.getByText("상품번호 규칙"));
    fireEvent.change(screen.getByLabelText("공급처"), {
      target: { value: "dome" },
    });
    fireEvent.change(screen.getByLabelText("상품번호 접두사"), {
      target: { value: "fd-한글" },
    });
    expect(screen.getByLabelText("상품번호 접두사")).toHaveValue("FD");
    fireEvent.click(screen.getByRole("button", { name: "저장" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      supplierCode: "dome",
      prefix: "FD",
    });
    expect(await screen.findByText("저장했습니다.")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });
});

