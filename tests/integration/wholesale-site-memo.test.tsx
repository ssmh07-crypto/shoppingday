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
import { WholesaleSiteMemo } from "@/app/admin/wholesale-sites/wholesale-site-memo";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

afterEach(() => {
  cleanup();
  refresh.mockReset();
  vi.unstubAllGlobals();
});

describe("도매사이트 메모장", () => {
  it("저장한 링크를 새 탭으로 열고 내용을 수정한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ success: true, site: { id: "site-1" } }),
      );
    vi.stubGlobal("fetch", fetchMock);

    render(<WholesaleSiteMemo initial={[site()]} />);

    const link = screen.getByRole("link", { name: /직감/ });
    expect(link).toHaveAttribute("href", "https://zicgam.com");
    expect(link).toHaveAttribute("target", "_blank");

    fireEvent.click(screen.getByRole("button", { name: "수정" }));
    fireEvent.change(screen.getByLabelText("설명"), {
      target: { value: "주방·생활용품 위탁 도매" },
    });
    fireEvent.click(screen.getByRole("button", { name: "변경 저장" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/wholesale-sites/site-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          name: "직감",
          url: "https://zicgam.com",
          description: "주방·생활용품 위탁 도매",
        }),
      }),
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("확인 후 저장한 링크를 삭제한다", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );

    render(<WholesaleSiteMemo initial={[site()]} />);
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/wholesale-sites/site-1", {
      method: "DELETE",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

function site() {
  return {
    id: "site-1",
    name: "직감",
    url: "https://zicgam.com",
    description: "생활용품 위탁 도매",
    updatedAt: "2026-07-30T02:00:00.000Z",
  };
}
