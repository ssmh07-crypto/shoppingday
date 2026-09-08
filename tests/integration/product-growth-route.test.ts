import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  target: vi.fn(),
  create: vi.fn(),
  auth: vi.fn(),
  rows: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: mocks.auth,
  AuthenticationError: class extends Error {},
}));
vi.mock("@/lib/db", () => ({
  withDbSession: (handler: (db: unknown) => unknown) =>
    handler({
      select: () => ({
        from: () => ({ where: () => ({ limit: mocks.rows }) }),
      }),
    }),
}));
vi.mock("@/modules/products/product-edit-repository", () => ({
  ProductEditRepository: class {
    find = mocks.find;
  },
}));
vi.mock("@/modules/channels/naver/naver-store-target-repository", () => ({
  NaverStoreTargetRepository: class {
    getForProduct = mocks.target;
  },
}));
vi.mock("@/modules/keywords/keyword-factory", () => ({
  createKeywordManagementService: () => ({ create: mocks.create }),
}));

import { POST } from "@/app/api/products/[id]/growth/route";
import { KeywordManagementError } from "@/modules/keywords/keyword-errors";

const id = "11111111-1111-4111-8111-111111111111";
const request = () =>
  POST(
    new Request(`http://localhost/api/products/${id}/growth`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: "owner" });
  mocks.find.mockResolvedValue({
    supplier: { originalName: "원본 상품" },
    product: { title: "판매 상품" },
  });
  mocks.target.mockResolvedValue({
    id: "store",
    storeUrl: "https://smartstore.naver.com/shop/",
  });
});

describe("위탁상품 성장관리 연결", () => {
  it("현재 소유자의 상품을 확인하고 등록 상품만 연결한다", async () => {
    mocks.rows.mockResolvedValueOnce([]);
    const response = await request();
    expect(response.status).toBe(409);
    expect(mocks.find).toHaveBeenCalledWith(id, "owner");
    expect(mocks.target).toHaveBeenCalledWith(id, "owner");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("기존 성장관리 기록이 있으면 재생성하지 않는다", async () => {
    mocks.rows
      .mockResolvedValueOnce([{ channelProductNo: "12345" }])
      .mockResolvedValueOnce([{ id: "existing" }]);
    const response = await request();
    expect(await response.json()).toEqual({ id: "existing" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("선택된 스토어와 상품번호로 공통 성장관리 생성 경로를 사용한다", async () => {
    mocks.rows
      .mockResolvedValueOnce([{ channelProductNo: "12345" }])
      .mockResolvedValueOnce([]);
    mocks.create.mockResolvedValue({ product: { id: "created" } });
    const response = await request();
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith("owner", {
      smartstoreUrl: "https://smartstore.naver.com/shop/products/12345",
      storeConnectionId: "store",
      productInput: { supplierTitle: "원본 상품" },
    });
  });
  it("동시 연결로 유일 제약에 걸리면 생성된 기존 기록을 연다", async () => {
    mocks.rows
      .mockResolvedValueOnce([{ channelProductNo: "12345" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "concurrent" }]);
    mocks.create.mockRejectedValue(
      new KeywordManagementError("duplicate_product", "duplicate", 409),
    );
    const response = await request();
    expect(await response.json()).toEqual({ id: "concurrent" });
  });
});
