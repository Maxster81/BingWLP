import type { MarketCode, ThemeKey } from '../api/types';

/** Prefisso comune: il frontend parla col backend solo con URL relativi. */
export const API_BASE = '/api';

export type QueryValue = string | number | boolean | null | undefined;

/** Codifica un valore di query; `null`/`undefined`/`''` → parametro omesso. */
function encodeValue(value: QueryValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.length === 0) return null;
  return encodeURIComponent(String(value));
}

/**
 * Costruisce una query string saltando i parametri vuoti.
 * Usa `%20` (non `+`) per gli spazi: le themeKey di Bing possono contenerne (es. `"wild animal"`).
 */
export function buildQuery(params: ReadonlyArray<readonly [string, QueryValue]>): string {
  const parts: string[] = [];
  for (const [key, value] of params) {
    const encoded = encodeValue(value);
    if (encoded === null) continue;
    parts.push(`${key}=${encoded}`);
  }
  return parts.join('&');
}

function withQuery(path: string, params: ReadonlyArray<readonly [string, QueryValue]>): string {
  const query = buildQuery(params);
  return query ? `${path}?${query}` : path;
}

export type ImageUrlParams = {
  theme: ThemeKey;
  index: number;
  market?: MarketCode | null;
  width?: number;
  height?: number;
  /** `qlt` (1..100, default lato backend 80). */
  quality?: number;
  mode?: 'redirect' | 'stream';
  /** `dl=1`: forza `Content-Disposition: attachment`. */
  download?: boolean;
  /**
   * Cache-buster: id dell'immagine. `/api/image?i=N` è una posizione logica che ruota:
   * cambiare `v` quando cambia l'immagine evita di riusare redirect 302 vecchi
   * (anche `immutable`) rimasti in cache dal browser.
   */
  version?: string;
  /** Override della base (default `/api/image`). */
  base?: string;
};

/** `GET /api/image?mkt=..&theme=..&i=..&w=..&h=..` */
export function imageUrl(params: ImageUrlParams): string {
  const { theme, index, market, width, height, quality, mode, download, version, base = `${API_BASE}/image` } = params;
  return withQuery(base, [
    ['mkt', market ?? undefined],
    ['theme', theme],
    ['i', index],
    ['v', version],
    ['w', width],
    ['h', height],
    ['qlt', quality],
    ['mode', mode],
    ['dl', download ? 1 : undefined],
  ]);
}

/**
 * URL di download: aggiunge `res=<key>` a `downloadBase` (che arriva dal contratto già con la query).
 * Idempotente rispetto a un eventuale `?`/`&` finale.
 */
export function downloadUrl(downloadBase: string, resolutionKey: string): string {
  const base = downloadBase.trim();
  if (base.length === 0) return `${API_BASE}/download?res=${encodeURIComponent(resolutionKey)}`;
  const suffix = `res=${encodeURIComponent(resolutionKey)}`;
  if (base.endsWith('?') || base.endsWith('&')) return `${base}${suffix}`;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}${suffix}`;
}

/** `GET /api/config` */
export function configUrl(): string {
  return `${API_BASE}/config`;
}

/** `GET /api/health` */
export function healthUrl(): string {
  return `${API_BASE}/health`;
}

/** `GET /api/resolutions` */
export function resolutionsUrl(): string {
  return `${API_BASE}/resolutions`;
}

/** `GET /api/themes?mkt=..` */
export function themesUrl(market?: MarketCode | null, refresh = false): string {
  return withQuery(`${API_BASE}/themes`, [
    ['mkt', market ?? undefined],
    ['refresh', refresh ? '1' : undefined],
  ]);
}

/** `GET /api/themes/{key}/images?mkt=..` (con `refresh=1` opzionale per bypassare la cache). */
export function themeImagesUrl(market: MarketCode | null, themeKey: ThemeKey, refresh = false): string {
  return withQuery(`${API_BASE}/themes/${encodeURIComponent(themeKey)}/images`, [
    ['mkt', market ?? undefined],
    ['refresh', refresh ? '1' : undefined],
  ]);
}

/** URL assoluto del documento corrente + percorso relativo (per `window.location.assign`). */
export function absoluteUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  try {
    return new URL(path, window.location.href).toString();
  } catch {
    return path;
  }
}
