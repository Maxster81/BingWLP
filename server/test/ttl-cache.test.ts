import { afterEach, describe, expect, it, vi } from 'vitest';
import { TtlCache } from '../src/cache/ttl-cache';

afterEach(() => {
  vi.useRealTimers();
});

describe('TtlCache', () => {
  it('miss su chiave assente', () => {
    const cache = new TtlCache<string>();
    expect(cache.get('assente')).toBeUndefined();
    expect(cache.has('assente')).toBe(false);
  });

  it('set/get fresco', () => {
    const cache = new TtlCache<number>();
    cache.set('a', 1, 60);
    expect(cache.get('a')).toEqual({ value: 1, stale: false });
    expect(cache.has('a')).toBe(true);
  });

  it('dopo il TTL il valore è ancora disponibile con stale: true', () => {
    let now = 1_000;
    const cache = new TtlCache<string>({ now: () => now });
    cache.set('k', 'v', 10);
    expect(cache.get('k')).toEqual({ value: 'v', stale: false });
    now += 10_001;
    expect(cache.get('k')).toEqual({ value: 'v', stale: true });
  });

  it('sovrascrive il valore e resetta la scadenza', () => {
    let now = 0;
    const cache = new TtlCache<string>({ now: () => now });
    cache.set('k', 'primo', 10);
    now += 9_000;
    cache.set('k', 'secondo', 10);
    now += 5_000;
    expect(cache.get('k')).toEqual({ value: 'secondo', stale: false });
  });

  it('delete/clear', () => {
    const cache = new TtlCache<number>();
    cache.set('a', 1, 60);
    cache.set('b', 2, 60);
    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('a')).toBe(false);
    cache.clear();
    expect(cache.stats().entries).toBe(0);
  });

  it('stats riporta entries e keys', () => {
    const cache = new TtlCache<string>();
    cache.set('themes:it-IT', 'a', 60);
    cache.set('images:it-IT:travel', 'b', 60);
    expect(cache.stats()).toEqual({
      entries: 2,
      keys: ['themes:it-IT', 'images:it-IT:travel'],
    });
  });

  it('eviction LRU quando si supera maxEntries', () => {
    const cache = new TtlCache<number>({ maxEntries: 2 });
    cache.set('a', 1, 60);
    cache.set('b', 2, 60);
    expect(cache.get('a')).toEqual({ value: 1, stale: false }); // touch: 'a' diventa recente
    cache.set('c', 3, 60);
    expect(cache.stats().keys).toEqual(['a', 'c']);
    expect(cache.get('b')).toBeUndefined();
  });

  it('sweep rimuove solo le entry scadute', () => {
    let now = 0;
    const cache = new TtlCache<string>({ now: () => now });
    cache.set('fresca', 'a', 60);
    cache.set('scaduta', 'b', 1);
    now += 2_000;
    expect(cache.sweep()).toBe(1);
    expect(cache.has('fresca')).toBe(true);
    expect(cache.has('scaduta')).toBe(false);
  });

  it('sweep periodico con timer unref e dispose', () => {
    vi.useFakeTimers();
    const cache = new TtlCache<string>({ sweepIntervalMs: 1_000 });
    cache.set('k', 'v', 1);
    vi.advanceTimersByTime(2_500);
    expect(cache.has('k')).toBe(false);
    cache.dispose();
  });
});
