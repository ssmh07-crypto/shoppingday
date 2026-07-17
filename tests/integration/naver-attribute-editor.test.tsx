// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { NaverAttributeEditor } from "@/app/admin/products/[id]/edit/naver-attribute-editor";
import type { NaverProductAttribute } from "@/lib/db/schema";

afterEach(cleanup);

describe("네이버 필수 속성 입력", () => {
  it("선택형 후보와 범위형 값·단위를 편집한다", () => {
    render(<Harness />);

    fireEvent.change(screen.getByRole("combobox", { name: "색상" }), {
      target: { value: "101" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "가로 최소값" }), {
      target: { value: "10" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "가로 단위" }), {
      target: { value: "A02036" },
    });

    expect(screen.getByTestId("attributes")).toHaveTextContent(
      '"attributeValueSeq":101',
    );
    expect(screen.getByTestId("attributes")).toHaveTextContent(
      '"minValue":"10"',
    );
    expect(screen.getByTestId("attributes")).toHaveTextContent(
      '"unitCode":"A02036"',
    );
  });
});

function Harness() {
  const [value, setValue] = useState<NaverProductAttribute[]>([]);
  return (
    <>
      <NaverAttributeEditor
        attributes={[
          {
            attributeSeq: 1,
            attributeName: "색상",
            attributeClassificationType: "SINGLE_SELECT",
          },
          {
            attributeSeq: 2,
            attributeName: "가로",
            attributeClassificationType: "RANGE",
            unitUsable: true,
            representativeUnitCode: "A02036",
          },
        ]}
        candidates={[
          {
            attributeSeq: 1,
            attributeValueSeq: 101,
            minAttributeValue: "빨강",
          },
        ]}
        units={[{ id: "A02036", unitCodeName: "cm" }]}
        value={value}
        onChange={setValue}
      />
      <output data-testid="attributes">{JSON.stringify(value)}</output>
    </>
  );
}
