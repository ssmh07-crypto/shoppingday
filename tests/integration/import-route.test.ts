import { beforeEach, describe, expect, it, vi } from "vitest";

class MockAuthenticationError extends Error {
  readonly code = "authentication_error";
}

const requireAdmin = vi.fn();
const importByExternalId = vi.fn();

vi.mock("@/lib/auth/admin", () => ({
  AuthenticationError: MockAuthenticationError,
  requireAdmin,
}));
vi.mock("@/lib/db", () => ({
  withDbSession: (operation: () => Promise<unknown>) => operation(),
}));
vi.mock("@/modules/suppliers/dome/dome-service", () => ({
  createDomeImportService: () => ({ importByExternalId }),
}));

const { POST } = await import("@/app/api/suppliers/dome/products/import/route");

describe("친구도매 import Route Handler", () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    importByExternalId.mockReset();
  });

  it("인증되지 않은 관리자 접근을 차단한다", async () => {
    requireAdmin.mockRejectedValue(
      new MockAuthenticationError("관리자 로그인이 필요합니다."),
    );
    const response = await POST(
      new Request("http://localhost/api/suppliers/dome/products/import", {
        method: "POST",
        body: JSON.stringify({ goodsno: "434379" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: "authentication_error" },
    });
    expect(importByExternalId).not.toHaveBeenCalled();
  });

  it("잘못된 goodsno를 서비스 호출 전에 거부한다", async () => {
    requireAdmin.mockResolvedValue({ id: "admin" });
    const response = await POST(
      new Request("http://localhost/api/suppliers/dome/products/import", {
        method: "POST",
        body: JSON.stringify({ goodsno: "../secret" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "validation_error" },
    });
    expect(importByExternalId).not.toHaveBeenCalled();
  });

  it("가져온 상품의 소유자로 현재 관리자를 전달한다", async () => {
    requireAdmin.mockResolvedValue({ id: "admin" });
    importByExternalId.mockResolvedValue({ success: true });
    const response = await POST(
      new Request("http://localhost/api/suppliers/dome/products/import", {
        method: "POST",
        body: JSON.stringify({ goodsno: "434379" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(response.status).toBe(200);
    expect(importByExternalId).toHaveBeenCalledWith("434379", "admin");
  });
});
