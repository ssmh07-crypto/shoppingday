import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/db";
import { applyNextSupplierPrice } from "@/modules/suppliers/core/price-application-service";
vi.mock("server-only", () => ({}));
const client = vi.hoisted(() => ({ fetchChannelProduct: vi.fn(), changeSalePrice: vi.fn() }));
vi.mock("@/modules/channels/naver/naver-category-service", () => ({ createConfiguredNaverClientForUser: vi.fn(async () => client) }));

function setup(price = 18000, publicationStatus = "published") {
  const results = [[{ id: "task", productId: "product", storeConnectionId: "store" }], [{ id: "product", sellingPrice: price }], [{ id: "task", publicationId: "publication", targetPrice: 18000, status: "pending", attempts: 0 }], [{ id: "publication", storeConnectionId: "store", status: publicationStatus, originProductNo: "123", channelProductNo: "456", remoteStatusType: "SALE" }], [{ role: "admin" }]];
  const updates: object[] = [];
  const chain = { from: () => chain, innerJoin: () => chain, where: () => chain, orderBy: () => chain, for: () => chain, limit: async () => results.shift() };
  const database = { select: () => chain, update: () => ({ set: (value: object) => { updates.push(value); return { where: async () => undefined }; } }), transaction: async (fn: (tx: unknown) => unknown) => fn(database) };
  return { database: database as unknown as Database, updates };
}
beforeEach(() => vi.clearAllMocks());
describe("supplier price application safety", () => {
  it("verifies the current price without rewriting an already applied price", async () => {
    const { database, updates } = setup();
    client.fetchChannelProduct.mockResolvedValue({ originProductNo: "123", originProduct: { salePrice: 18000 } });
    expect((await applyNextSupplierPrice(database, "owner")).status).toBe("succeeded");
    expect(client.changeSalePrice).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ status: "succeeded" });
  });
  it("changes only the intended price and verifies it", async () => {
    const { database } = setup();
    client.fetchChannelProduct.mockResolvedValueOnce({ originProductNo: "123", originProduct: { salePrice: 15000 } }).mockResolvedValueOnce({ originProductNo: "123", originProduct: { salePrice: 18000 } });
    expect((await applyNextSupplierPrice(database, "owner")).status).toBe("succeeded");
    expect(client.changeSalePrice).toHaveBeenCalledWith("123", 18000);
  });
  it("does not overwrite a newer local edit", async () => {
    const { database } = setup(19000);
    expect((await applyNextSupplierPrice(database, "owner")).status).toBe("superseded");
    expect(client.fetchChannelProduct).not.toHaveBeenCalled();
  });
  it("does not overlap publication deletion", async () => {
    const { database } = setup(18000, "deleting");
    expect((await applyNextSupplierPrice(database, "owner")).status).toBe("busy");
    expect(client.fetchChannelProduct).not.toHaveBeenCalled();
  });
  it("retains failure when remote verification fails", async () => {
    const { database, updates } = setup();
    client.fetchChannelProduct.mockResolvedValue({ originProductNo: "123", originProduct: { salePrice: 15000 } });
    expect((await applyNextSupplierPrice(database, "owner")).status).toBe("failed");
    expect(updates[0]).toMatchObject({ status: "failed", attempts: 1 });
  });
  it("never writes to a mismatched remote product", async () => {
    const { database } = setup();
    client.fetchChannelProduct.mockResolvedValue({ originProductNo: "999", originProduct: { salePrice: 15000 } });
    expect((await applyNextSupplierPrice(database, "owner")).status).toBe("failed");
    expect(client.changeSalePrice).not.toHaveBeenCalled();
  });
});
