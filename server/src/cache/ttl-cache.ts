/**
 * Cache in-memory generica con TTL per entry, fallback "stale" e limite di capienza.
 *
 * Semantica:
 * - `get(key)` ritorna `{ value, stale }` se la chiave è presente (anche scaduta,
 *   con `stale: true`) così i chiamanti possono fare graceful degradation.
 * - le entry sono in ordine di inserimento/usso: l'eviction a capienza è LRU semplice.
 */
export type CacheEntryState<T> = {
  value: T;
  stale: boolean;
};

export type TtlCacheStats = {
  /** Numero di entry presenti (scadute incluse, finché non passano dallo sweep). */
  entries: number;
  /** Chiavi presenti, utili per diagnostica/health. */
  keys: string[];
};

export type TtlCacheOptions = {
  /** Numero massimo di entry prima dell'eviction LRU (default 500). */
  maxEntries?: number;
  /** Se > 0 avvia uno sweep periodico delle entry scadute (timer unref'ed). */
  sweepIntervalMs?: number;
  /** Orologio iniettabile nei test (default `Date.now`). */
  now?: () => number;
};

type Entry<T> = {
  value: T;
  expiresAt: number;
};

export class TtlCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly maxEntries: number;
  private readonly now: () => number;
  private sweepTimer: NodeJS.Timeout | undefined;

  constructor(options: TtlCacheOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 500);
    this.now = options.now ?? (() => Date.now());

    const sweepIntervalMs = options.sweepIntervalMs ?? 0;
    if (sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => {
        this.sweep();
      }, sweepIntervalMs);
      // Non tenere vivo il processo per colpa dello sweep.
      this.sweepTimer.unref?.();
    }
  }

  get(key: string): CacheEntryState<T> | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    // Touch LRU: sposta la chiave in fondo (più recente).
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { value: entry.value, stale: this.now() > entry.expiresAt };
  }

  set(key: string, value: T, ttlSec: number): void {
    const expiresAt = this.now() + Math.max(0, ttlSec) * 1000;
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt });
    this.evictOverflow();
  }

  /** `true` se la chiave è presente, anche se scaduta. */
  has(key: string): boolean {
    return this.entries.has(key);
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  /** Rimuove le entry scadute e ritorna quante ne ha eliminate. */
  sweep(): number {
    const now = this.now();
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (now > entry.expiresAt) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  stats(): TtlCacheStats {
    return { entries: this.entries.size, keys: [...this.entries.keys()] };
  }

  /** Ferma lo sweep periodico (utile nei test / shutdown). */
  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = undefined;
    }
  }

  private evictOverflow(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) return;
      this.entries.delete(oldest.value);
    }
  }
}
