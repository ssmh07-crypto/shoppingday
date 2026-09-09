// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSupplier } from "../../src/app/admin/products/import/supplier-batch-runner";

afterEach(() => vi.unstubAllGlobals());
const done = { id: "job-1", status: "succeeded", total: 3, processed: 3, created: 1, updated: 1, unchanged: 1 };
describe("supplier batch runner", () => {
  it("starts API changes only and waits for its exact job", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ job: null })).mockResolvedValueOnce(Response.json({ job: { id: "job-1" } })).mockResolvedValueOnce(Response.json({ job: done }));
    vi.stubGlobal("fetch", fetcher);
    expect(await runSupplier("dome", new AbortController().signal, vi.fn())).toContain("신규 1");
    expect(fetcher.mock.calls[1][1].body).toBe(JSON.stringify({ mode: "changes" }));
  });
  it("waits for an existing job without posting another", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ job: { ...done, status: "running" } })).mockResolvedValueOnce(Response.json({ job: done }));
    vi.stubGlobal("fetch", fetcher);
    await runSupplier("dome", new AbortController().signal, vi.fn());
    expect(fetcher.mock.calls.every((call) => !call[1].method)).toBe(true);
  });
  it("does not report success for a different job", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ job: { ...done, status: "running" } })).mockResolvedValueOnce(Response.json({ job: { ...done, id: "other" } })));
    await expect(runSupplier("dome", new AbortController().signal, vi.fn())).rejects.toThrow("작업 ID");
  });
  it("forwards one approval and only accepts matching browser progress", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json({ job: null })).mockResolvedValueOnce(Response.json({ job: done })));
    window.addEventListener("shoppingday:zicgam-catalog-start", ((event: CustomEvent) => {
      expect(event.detail.batchConfirmed).toBe(true);
      window.dispatchEvent(new CustomEvent("shoppingday:zicgam-catalog-progress", { detail: { requestId: "other", provider: "zicgam", phase: "failed" } }));
      window.dispatchEvent(new CustomEvent("shoppingday:zicgam-catalog-progress", { detail: { ...event.detail, phase: "queued", summary: { jobId: "job-1" } } }));
    }) as EventListener, { once: true });
    expect(await runSupplier("zicgam", new AbortController().signal, vi.fn())).toContain("변경 1");
  });
});
