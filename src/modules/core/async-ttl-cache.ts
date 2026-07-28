export type AsyncTtlCacheResult<T> = {
  value: T;
  cached: boolean;
  stale: boolean;
};

export type AsyncTtlCacheStats = {
  requests: number;
  hits: number;
  misses: number;
  coalesced: number;
  staleFallbacks: number;
  loadFailures: number;
  evictions: number;
  entries: number;
  inFlight: number;
};

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

export class AsyncTtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();
  private readonly inFlight = new Map<
    string,
    Promise<AsyncTtlCacheResult<T>>
  >();
  private readonly counters = {
    requests: 0,
    hits: 0,
    misses: 0,
    coalesced: 0,
    staleFallbacks: 0,
    loadFailures: 0,
    evictions: 0,
  };

  constructor(
    private readonly ttlMs: number,
    private readonly maximumEntries: number,
  ) {}

  async get(
    key: string,
    load: () => Promise<T>,
    now: () => number = Date.now,
  ): Promise<AsyncTtlCacheResult<T>> {
    this.counters.requests += 1;
    const existing = this.entries.get(key);
    if (existing && existing.expiresAt > now()) {
      this.counters.hits += 1;
      this.touch(key, existing);
      return { value: existing.value, cached: true, stale: false };
    }
    const active = this.inFlight.get(key);
    if (active) {
      this.counters.coalesced += 1;
      return active;
    }
    this.counters.misses += 1;

    const operation = (async () => {
      try {
        const value = await load();
        this.set(key, value, now() + this.ttlMs);
        return { value, cached: false, stale: false };
      } catch (error) {
        this.counters.loadFailures += 1;
        if (existing) {
          this.counters.staleFallbacks += 1;
          this.touch(key, existing);
          return { value: existing.value, cached: true, stale: true };
        }
        throw error;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, operation);
    return operation;
  }

  clear() {
    this.entries.clear();
    this.inFlight.clear();
  }

  delete(key: string) {
    return this.entries.delete(key);
  }

  snapshot(): AsyncTtlCacheStats {
    return {
      ...this.counters,
      entries: this.entries.size,
      inFlight: this.inFlight.size,
    };
  }

  private set(key: string, value: T, expiresAt: number) {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt });
    while (this.entries.size > this.maximumEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
      this.counters.evictions += 1;
    }
  }

  private touch(key: string, entry: CacheEntry<T>) {
    this.entries.delete(key);
    this.entries.set(key, entry);
  }
}
