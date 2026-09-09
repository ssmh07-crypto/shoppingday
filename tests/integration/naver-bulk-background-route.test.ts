import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), env: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/app/api/products/route-utils", () => ({ withAdminProductRoute: (handler: (user: { id: string }, db: object) => Promise<Response>) => handler({ id: "owner" }, {}) }));
vi.mock("@/lib/env/server", () => ({ getServerEnv: mocks.env }));
vi.mock("@/modules/channels/naver/naver-bulk-job-repository", () => ({ NaverBulkJobRepository: class { get = mocks.get; } }));
import { POST } from "@/app/api/products/bulk-jobs/[id]/background/route";
const id = "11111111-1111-4111-8111-111111111111";
const run = () => POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id }) });
beforeEach(() => { vi.resetAllMocks(); mocks.env.mockReturnValue({ GITHUB_ACTIONS_TOKEN: "test-token" }); });
afterEach(() => vi.unstubAllGlobals());
it("소유자가 접근할 수 없는 작업은 실행하지 않는다", async () => {
  mocks.get.mockResolvedValue(null);
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await expect(run()).rejects.toThrow();
  expect(mocks.get).toHaveBeenCalledWith(id, "owner");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("완료한 작업은 다시 접수하지 않는다", async () => {
  mocks.get.mockResolvedValue({ id, status: "completed" });
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  expect((await run()).status).toBe(200);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("접수 실패 시 기존 작업을 삭제하거나 새 작업을 만들지 않는다", async () => {
  mocks.get.mockResolvedValue({ id, status: "queued" });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
  expect((await run()).status).toBe(503);
});
