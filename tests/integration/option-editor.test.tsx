// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OptionEditor } from "@/app/admin/products/[id]/edit/option-editor";
import type { EditedOptions } from "@/lib/db/schema";

afterEach(cleanup);

describe("상품 옵션 편집", () => {
  it("활성 옵션값으로 전체 조합을 한 번에 생성한다", () => {
    const onChange = vi.fn();
    const value: EditedOptions = {
      groups: [
        {
          id: "color",
          name: "색상",
          values: [
            { id: "red", name: "빨강", enabled: true },
            { id: "blue", name: "파랑", enabled: true },
          ],
        },
        {
          id: "size",
          name: "사이즈",
          values: [
            { id: "small", name: "소", enabled: true },
            { id: "large", name: "대", enabled: true },
          ],
        },
      ],
      combinations: [],
    };

    render(<OptionEditor value={value} onChange={onChange} />);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "활성 옵션 조합이 없습니다",
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: "활성 옵션으로 전체 조합 생성 (4개)",
      }),
    );

    const next = onChange.mock.calls[0]?.[0] as EditedOptions;
    expect(next.combinations.map((combination) => combination.valueIds)).toEqual(
      [
        ["red", "small"],
        ["red", "large"],
        ["blue", "small"],
        ["blue", "large"],
      ],
    );
    expect(next.combinations.every((combination) => combination.enabled)).toBe(
      true,
    );
    expect(next.combinations.every((combination) => combination.stock === 0)).toBe(
      true,
    );
  });
});
