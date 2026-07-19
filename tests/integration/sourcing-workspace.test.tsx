// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SourcingWorkspace } from "@/app/admin/sourcing/sourcing-workspace";

afterEach(cleanup);

describe("소싱 조사 화면", () => {
  it("요청한 네 단계와 위험 확인 항목을 표시한다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);

    expect(screen.getByRole("heading", { name: "키워드 시장 조사" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "품목 조사" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "상품 리뷰 조사" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "샘플 확인" })).toBeInTheDocument();
    expect(screen.getByText("가격 스펙트럼이 넓은가?")).toBeInTheDocument();
    expect(screen.getByText("메인 키워드가 명확하고 대다수 상품이 일치하는가?")).toBeInTheDocument();
    expect(screen.getByText("인증이 필요한 제품인가?")).toBeInTheDocument();
  });

  it("예상 판매가를 입력하면 마진 30% 기준 단순 최대 구매단가를 보여준다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);
    const expectedPrice = screen.getByText("내 예상 판매단가").closest("label")!;
    fireEvent.change(expectedPrice.querySelector("input")!, {
      target: { value: "30000" },
    });
    expect(screen.getAllByText("21,000원").length).toBeGreaterThan(0);
    expect(screen.getByText(/수수료·배송비·관부가세/)).toBeInTheDocument();
  });

  it("1688 샘플 후보를 여러 개 추가할 수 있다", () => {
    render(<SourcingWorkspace initialItems={[]} initialDetail={null} />);
    fireEvent.click(screen.getByRole("button", { name: "+ 1688 샘플 후보 추가" }));
    expect(screen.getByText("샘플 후보 1")).toBeInTheDocument();
    expect(screen.getByText("1688 링크")).toBeInTheDocument();
  });
});
