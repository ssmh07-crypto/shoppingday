import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { AUTHENTICATED_USER_HEADER } from "@/lib/auth/trusted-request";

const authMock = vi.hoisted(() => ({
  getClaims: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: authMock.getClaims },
  }),
}));

import { middleware } from "@/middleware";

describe("middleware authenticated user handoff", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-key";
    authMock.getClaims.mockReset();
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  it("forwards the subject only after Supabase verifies the claims", async () => {
    authMock.getClaims.mockResolvedValue({
      data: { claims: { sub: "verified-user" } },
      error: null,
    });

    const response = await middleware(
      new NextRequest("https://shoppingday.test/admin/products"),
    );

    expect(
      response.headers.get(
        `x-middleware-request-${AUTHENTICATED_USER_HEADER}`,
      ),
    ).toBe("verified-user");
  });

  it("removes a spoofed internal header when verification fails", async () => {
    authMock.getClaims.mockRejectedValue(new Error("invalid token"));
    const request = new NextRequest(
      "https://shoppingday.test/admin/products",
      {
        headers: { [AUTHENTICATED_USER_HEADER]: "spoofed-user" },
      },
    );

    const response = await middleware(request);

    expect(
      response.headers.get(
        `x-middleware-request-${AUTHENTICATED_USER_HEADER}`,
      ),
    ).toBeNull();
  });
});
