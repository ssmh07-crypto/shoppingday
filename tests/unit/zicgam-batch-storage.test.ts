import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { resetEnvCacheForTests } from "@/lib/env/server";
import {
  createZicgamSignedUpload,
  createZicgamUploadToken,
  isZicgamJobId,
  verifyZicgamUploadToken,
  zicgamChunkPath,
} from "@/modules/suppliers/zicgam/zicgam-batch-storage";

const jobId = "123e4567-e89b-42d3-a456-426614174000";

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  vi.stubEnv("DATABASE_URL", "postgresql://test:test@localhost:5432/test");
  vi.stubEnv("DOME_API_MOCK_MODE", "true");
  vi.stubEnv("USE_MOCK_EXTERNAL_APIS", "false");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
  resetEnvCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Zicgam batch storage", () => {
  it("creates a stable, sortable object path for each chunk", () => {
    expect(zicgamChunkPath(jobId, 12)).toBe(`${jobId}/00012.json.gz`);
  });

  it("accepts only canonical UUID job IDs", () => {
    expect(isZicgamJobId(jobId)).toBe(true);
    expect(isZicgamJobId("../../another-folder")).toBe(false);
    expect(isZicgamJobId("123e4567-e89b-02d3-a456-426614174000")).toBe(false);
  });

  it("verifies only the token signed for the same job", async () => {
    const token = await createZicgamUploadToken(jobId);

    await expect(verifyZicgamUploadToken(jobId, token)).resolves.toBe(true);
    await expect(
      verifyZicgamUploadToken("123e4567-e89b-42d3-a456-426614174001", token),
    ).resolves.toBe(false);
    await expect(verifyZicgamUploadToken(jobId, "invalid-token")).resolves.toBe(false);
  });

  it("creates a direct signed upload URL without proxying the chunk body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          url: `/object/upload/sign/zicgam-imports/${jobId}/00003.json.gz?token=signed-token`,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(createZicgamSignedUpload(jobId, 3)).resolves.toEqual({
      signedUrl: `https://example.supabase.co/storage/v1/object/upload/sign/zicgam-imports/${jobId}/00003.json.gz?token=signed-token`,
      apiKey: "test-anon-key",
      path: `${jobId}/00003.json.gz`,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `https://example.supabase.co/storage/v1/object/upload/sign/zicgam-imports/${jobId}/00003.json.gz`,
      expect.objectContaining({ method: "POST", body: "{}" }),
    );
  });
});
