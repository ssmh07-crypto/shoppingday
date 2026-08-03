import { describe, expect, it } from "vitest";
import { wholesaleSiteInputSchema } from "@/modules/wholesale-sites/wholesale-site";

describe("도매사이트 메모 입력", () => {
  it("사이트명과 http 또는 https 링크를 저장한다", () => {
    expect(
      wholesaleSiteInputSchema.parse({
        name: " 직감 ",
        url: "https://zicgam.com",
        description: " 생활용품 위탁 도매 ",
      }),
    ).toEqual({
      name: "직감",
      url: "https://zicgam.com",
      description: "생활용품 위탁 도매",
    });
    expect(
      wholesaleSiteInputSchema.safeParse({
        name: "잘못된 링크",
        url: "javascript:alert(1)",
        description: "",
      }).success,
    ).toBe(false);
  });

  it("사이트명과 링크를 필수로 받고 설명 길이를 제한한다", () => {
    expect(
      wholesaleSiteInputSchema.safeParse({
        name: "",
        url: "",
        description: "",
      }).success,
    ).toBe(false);
    expect(
      wholesaleSiteInputSchema.safeParse({
        name: "도매사이트",
        url: "https://example.com",
        description: "가".repeat(2001),
      }).success,
    ).toBe(false);
  });
});
