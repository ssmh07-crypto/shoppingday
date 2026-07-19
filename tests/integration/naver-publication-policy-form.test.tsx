// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NaverPublicationPolicyForm } from "@/app/admin/components/naver-publication-policy-form";
import { emptyNaverPublicationPolicy } from "@/modules/channels/naver/naver-publication-policy";

afterEach(() => vi.unstubAllGlobals());

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
});
