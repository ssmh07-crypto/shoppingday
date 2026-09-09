import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

function setup() {
  const storage = () => {
    const values: Record<string, unknown> = {};
    return {
      values,
      get: async (key: string) => ({ [key]: values[key] }),
      set: async (next: object) => {
        Object.assign(values, structuredClone(next));
      },
      remove: async (key: string) => {
        delete values[key];
      },
      setAccessLevel: vi.fn(),
    };
  };
  const local = storage(),
    session = storage();
  const scope = {} as {
    ShoppingdayCredentialVault: {
      unlock(value: string): Promise<void>;
      save(provider: string, username: string, password: string): Promise<void>;
      credentials(
        provider: string,
      ): Promise<{ username: string; password: string } | null>;
      lock(): Promise<void>;
      clear(): Promise<void>;
      status(): Promise<{ providers: string[] }>;
    };
  };
  Function(
    "chrome",
    "globalThis",
    "crypto",
    readFileSync("chrome-extension/credential-vault.js", "utf8"),
  )({ storage: { local, session } }, scope, webcrypto);
  return { vault: scope.ShoppingdayCredentialVault, local, session };
}

describe("supplier credential vault", () => {
  it("encrypts credentials, locks without losing them, and rejects the wrong password", async () => {
    const { vault, local, session } = setup();
    await vault.unlock("test-master-passphrase");
    await vault.save("zicgam", "test-account", "test-secret-password");
    expect(JSON.stringify(local.values)).not.toContain("test-account");
    expect(JSON.stringify(local.values)).not.toContain("test-secret-password");
    expect(await vault.credentials("zicgam")).toEqual({
      username: "test-account",
      password: "test-secret-password",
    });
    await vault.lock();
    expect(session.values).toEqual({});
    await expect(vault.credentials("zicgam")).rejects.toThrow();
    await expect(vault.unlock("incorrect-master-passphrase")).rejects.toThrow();
    expect(session.values).toEqual({});
    await vault.unlock("test-master-passphrase");
    expect((await vault.status()).providers).toEqual(["zicgam"]);
    await vault.clear();
    expect(local.values).toEqual({});
    expect(session.values).toEqual({});
  });
  it("rejects unsupported providers and short vault passwords", async () => {
    const { vault } = setup();
    await expect(vault.unlock("short")).rejects.toThrow();
    await expect(vault.credentials("untrusted")).rejects.toThrow();
  });
});
