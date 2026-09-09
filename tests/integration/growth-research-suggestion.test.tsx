// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { GrowthResearchSuggestion } from "@/app/admin/keywords/growth-research-suggestion";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it.each(["10", "20"])("카테고리 %s에서 확인 후만 적용하고 기존 속성을 보호한다", async categoryId => {
  const onApply = vi.fn();
  const existing = { attributeSeq: 1, attributeValueSeq: 11, minValue: "", maxValue: "", unitCode: null };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ suggestion: { title: "욕실화", searchTags: ["미끄럼방지"], warnings: [], categoryId: "10", attributes: [{ categoryId: "10", attributeSeq: 1, attributeValueSeq: 99 }, { categoryId: "10", attributeSeq: 2, attributeValueSeq: 22 }] } })));
  render(<GrowthResearchSuggestion id="one" categoryId={categoryId} attributes={[existing]} onApply={onApply} />);
  fireEvent.click(screen.getByRole("button", { name: "저장된 정밀 분석으로 상품명·태그 초안 확인" }));
  const apply = await screen.findByRole("button", { name: "확인한 상품명·태그를 편집 초안에 적용" });
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.click(apply);
  const values = onApply.mock.calls[0][2];
  expect(values[0]).toEqual(existing);
  expect(values).toHaveLength(categoryId === "10" ? 2 : 1);
});
