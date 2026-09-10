import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db";
import { applyNextSupplierChange } from "@/modules/suppliers/core/change-application-service";
vi.mock("server-only", () => ({}));
const client = vi.hoisted(() => ({ fetchChannelProduct: vi.fn(), changeProductStatus: vi.fn(), changeSupplierDescription: vi.fn() }));
vi.mock("@/modules/channels/naver/naver-category-service", () => ({ createConfiguredNaverClientForUser: vi.fn(async () => client) }));
function setup(options: { availability?: string; kind?: string; description?: string; publicationStatus?: string; role?: string } = {}) {
  const kind = options.kind ?? "sold_out";
  const results = [[{ id: "task", productId: "product", storeConnectionId: "store" }], [{ id: "product", description: options.description ?? "old", draftVersion: 2 }], [{ id: "task", publicationId: "publication", supplierProductId: "source", kind, previousValue: "old", targetValue: kind === "description" ? "new" : "sold_out", status: "pending", attempts: 0 }], [{ id: "publication", storeConnectionId: "store", status: options.publicationStatus ?? "published", originProductNo: "123", channelProductNo: "456", remoteStatusType: "SALE" }], [{ availability: options.availability ?? "sold_out", description: "new" }], [{ role: options.role ?? "admin" }]];
  const updates: object[] = [];
  const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, orderBy: () => chain, for: () => chain, limit: async () => results.shift() };
  const database = { select: () => chain, update: () => ({ set: (value: object) => { updates.push(value); return { where: async () => undefined }; } }), transaction: async (fn: (tx: unknown) => unknown) => fn(database) };
  return { database: database as unknown as Database, updates };
}
beforeEach(() => vi.resetAllMocks());
describe("공급처 상태·상세 반영 보호", () => {
  it("품절만 반영하고 원격 상태를 재확인한다", async () => {
    const { database, updates } = setup();
    client.fetchChannelProduct.mockResolvedValueOnce({ originProductNo: "123", originProduct: { statusType: "SALE" } }).mockResolvedValueOnce({ originProductNo: "123", originProduct: { statusType: "OUTOFSTOCK" } });
    expect((await applyNextSupplierChange(database, "owner", ["sold_out"])).status).toBe("succeeded");
    expect(client.changeProductStatus).toHaveBeenCalledWith("123", { statusType: "OUTOFSTOCK" });
    expect(updates.at(-1)).toMatchObject({ status: "succeeded" });
  });
  it.each(["active", "unknown", "discontinued"])("최신 공급 상태가 %s이면 오래된 품절을 폐기한다", async availability => {
    const { database } = setup({ availability });
    expect((await applyNextSupplierChange(database, "owner", ["sold_out"])).status).toBe("superseded");
    expect(client.fetchChannelProduct).not.toHaveBeenCalled();
  });
  it("판매자의 로컬 상세 편집을 보존한다", async () => {
    const { database } = setup({ kind: "description", description: "seller edit" });
    expect((await applyNextSupplierChange(database, "owner", ["description"])).status).toBe("superseded");
    expect(client.changeSupplierDescription).not.toHaveBeenCalled();
  });
  it("삭제 진행 중인 상품에 쓰지 않는다", async () => {
    const { database } = setup({ publicationStatus: "deleting" });
    expect((await applyNextSupplierChange(database, "owner", ["sold_out"])).status).toBe("busy");
    expect(client.fetchChannelProduct).not.toHaveBeenCalled();
  });
  it("판매자가 중지한 상품의 상태를 품절로 바꾸지 않는다", async () => {
    client.fetchChannelProduct.mockResolvedValue({ originProductNo: "123", originProduct: { statusType: "SUSPENSION" } });
    expect((await applyNextSupplierChange(setup().database, "owner", ["sold_out"])).status).toBe("failed");
    expect(client.changeProductStatus).not.toHaveBeenCalled();
  });
  it("반영 후 검증 실패를 성공으로 기록하지 않는다", async () => {
    client.fetchChannelProduct.mockResolvedValue({ originProductNo: "123", originProduct: { statusType: "SALE" } });
    const { database, updates } = setup();
    expect((await applyNextSupplierChange(database, "owner", ["sold_out"])).status).toBe("failed");
    expect(updates.at(-1)).toMatchObject({ status: "failed" });
  });
});
