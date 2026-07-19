import { describe, expect, it } from "vitest";
import {
  createMockAnalysis,
  createMockMetrics,
} from "@/modules/keywords/mock-fixtures";

const input = {
  supplierTitle: "여성 린넨 원피스",
  description: "여름용",
  category: "원피스",
  features: ["루즈핏"],
  materials: ["린넨"],
  colors: ["베이지"],
  sizes: ["FREE"],
  target: "여성",
  seasons: ["여름"],
  supplierUrl: "",
  imageUrls: [],
  memo: "",
};

describe("외부 API Mock fixture", () => {
  it("같은 입력은 실행할 때마다 같은 분석과 지표를 만든다", () => {
    expect(createMockAnalysis(input, 30)).toEqual(createMockAnalysis(input, 30));
    expect(createMockMetrics(["키워드1", "키워드2"])).toEqual(
      createMockMetrics(["키워드1", "키워드2"]),
    );
  });

  it("일부 실패와 전체 실패 시나리오를 구분한다", () => {
    const keywords = ["키워드1", "키워드2", "키워드3", "키워드4"];
    expect(createMockMetrics(keywords, "partial-failure").map((item) => item.status))
      .toEqual(["success", "success", "success", "error"]);
    expect(createMockMetrics(keywords, "full-failure").every((item) => item.status === "error"))
      .toBe(true);
  });
});
