import { describe, expect, it } from "vitest";
import { assessProductTitle } from "@/modules/keywords/title-quality";

describe("상품명 기본 품질 검사", () => {
  it("상품 유형 누락, 반복, 넓은 분류어와 홍보 표현을 안내한다", () => {
    const issues = assessProductTitle(
      "철제 바느질 바느질부자재 바느질 무료배송",
      "골무",
    );

    expect(issues.map((issue) => issue.code)).toEqual([
      "missing-product-type",
      "duplicate-token",
      "generic-category",
      "promotional-term",
    ]);
  });

  it("40자 권장은 저장 차단이 아닌 품질 안내로 반환한다", () => {
    const issues = assessProductTitle(`${"가".repeat(40)} 골무`, "골무");

    expect(issues).toEqual([
      expect.objectContaining({
        code: "long-title",
        message: expect.stringContaining("저장은 가능"),
      }),
    ]);
  });

  it("간결하고 구체적인 상품명은 문제로 표시하지 않는다", () => {
    expect(assessProductTitle("철제 바느질 골무", "골무")).toEqual([]);
  });
});
