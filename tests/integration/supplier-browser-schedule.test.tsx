// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SupplierBrowserSchedule } from "@/app/admin/products/import/supplier-browser-schedule";

afterEach(() => { cleanup(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("Chrome supplier scheduling", () => {
  it("is opt-in and runs only the saved browser suppliers when due", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-08T00:00:00Z"));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("navigator", { locks: { request: async (_name: string, _options: object, callback: (lock: object) => unknown) => callback({}) } });
    const run = vi.fn(async () => undefined);
    render(<SupplierBrowserSchedule selected={["dome", "zicgam"]} running={false} extensionReady onRun={run} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Chrome 도매처 확인 예약 · 꺼짐"));
    fireEvent.click(screen.getByText("선택한 Chrome 도매처로 예약 저장"));
    const stored = JSON.parse(localStorage.getItem("shoppingday:browser-supplier-schedule")!);
    expect(stored.providers).toEqual(["zicgam"]);
    vi.setSystemTime(stored.nextAt);
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(run).toHaveBeenCalledExactlyOnceWith(["zicgam"]);
    await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
    expect(run).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("예약 해제"));
    expect(localStorage.getItem("shoppingday:browser-supplier-schedule")).toBeNull();
  });
});
