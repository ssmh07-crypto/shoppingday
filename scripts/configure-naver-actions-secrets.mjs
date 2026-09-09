// Run only with permission to send the existing relay connection to this repository.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
if (!process.env.NAVER_COMMERCE_RELAY_URL) {
  for (const name of ["shoppingday-cloudflared.error.log", "shoppingday-cloudflared.out.log"]) {
    try {
      const matches = readFileSync(join(tmpdir(), name), "utf8").match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
      if (matches?.length) { process.env.NAVER_COMMERCE_RELAY_URL = matches.at(-1); break; }
    } catch { /* Check the other existing tunnel log. */ }
  }
}
const keys = ["NAVER_COMMERCE_RELAY_URL", "NAVER_COMMERCE_RELAY_SHARED_SECRET"];
for (const key of keys) {
  if (!process.env[key]) throw new Error(`${key} missing`);
}
try {
  const response = await fetch(`${process.env.NAVER_COMMERCE_RELAY_URL}/healthz`, { signal: AbortSignal.timeout(10000) });
  const health = await response.json();
  if (!response.ok || health.status !== "ok") throw new Error();
} catch { throw new Error("Existing relay is not healthy; secrets were not changed."); }
for (const key of keys) {
  const result = spawnSync("gh", ["secret", "set", key, "--repo", "ssmh07-crypto/shoppingday"], {
    input: process.env[key], encoding: "utf8", windowsHide: true,
  });
  if (result.status !== 0) throw new Error(`${key} registration failed`);
  console.info(`${key} registered`);
}
