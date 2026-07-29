import { describe, expect, it, vi } from "vitest";
import { AsyncTtlCache } from "@/modules/core/async-ttl-cache";

describe("비동기 TTL 캐시", () => {
  it("동일 키의 동시 로드를 하나의 요청으로 합친다", async () => {
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => {
      resolve = done;
    });
    const load = vi.fn(() => pending);
    const cache = new AsyncTtlCache<string>(1_000, 10);

    const first = cache.get("same", load, () => 100);
    const second = cache.get("same", load, () => 100);
    resolve("value");

    await expect(Promise.all([first, second])).resolves.toEqual([
      { value: "value", cached: false, stale: false },
      { value: "value", cached: false, stale: false },
    ]);
    expect(load).toHaveBeenCalledOnce();
    expect(cache.snapshot()).toMatchObject({
      requests: 2,
      hits: 0,
      misses: 1,
      coalesced: 1,
      entries: 1,
      inFlight: 0,
    });
  });

  it("갱신 실패 시 만료된 값을 stale로 반환한다", async () => {
    let now = 100;
    const cache = new AsyncTtlCache<string>(10, 10);
    await cache.get("key", async () => "old", () => now);
    now = 111;

    await expect(
      cache.get(
        "key",
        async () => {
          throw new Error("unavailable");
        },
        () => now,
      ),
    ).resolves.toEqual({ value: "old", cached: true, stale: true });
    expect(cache.snapshot()).toMatchObject({
      requests: 2,
      misses: 2,
      staleFallbacks: 1,
      loadFailures: 1,
    });
  });

  it("선택한 키만 무효화해 다음 요청에서 다시 불러온다", async () => {
    const cache = new AsyncTtlCache<string>(1_000, 10);
    const load = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");

    await cache.get("key", load, () => 100);
    expect(cache.delete("key")).toBe(true);
    await expect(cache.get("key", load, () => 101)).resolves.toMatchObject({
      value: "second",
      cached: false,
    });
    expect(load).toHaveBeenCalledTimes(2);
  });
});
