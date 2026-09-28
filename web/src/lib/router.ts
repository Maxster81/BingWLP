import type { MarketCode, ThemeKey } from '../api/types';
import { isMarketCode } from './format';

/**
 * Router hash minimale (nessun router esterno).
 *
 *   #/                                → griglia temi
 *   #/tema/travel                     → dettaglio tema
 *   #/tema/travel/3?mkt=it-IT         → dettaglio tema con lightbox aperta (4ª immagine)
 *
 * Il market viaggia come query string `?mkt=xx-XX`.
 */

export type ThemesRoute = {
  kind: 'themes';
  market: MarketCode | null;
};

export type ThemeRoute = {
  kind: 'theme';
  market: MarketCode | null;
  themeKey: ThemeKey;
  /** `null` = nessuna lightbox aperta; `0`-based altrimenti. */
  index: number | null;
};

export type Route = ThemesRoute | ThemeRoute;

export const THEMES_ROUTE: ThemesRoute = { kind: 'themes', market: null };

function safeDecode(raw: string): string {
  const withSpaces = raw.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(withSpaces);
  } catch {
    return withSpaces;
  }
}

function splitPath(raw: string): { path: string; query: string } {
  const queryStart = raw.indexOf('?');
  if (queryStart === -1) return { path: raw, query: '' };
  return { path: raw.slice(0, queryStart), query: raw.slice(queryStart + 1) };
}

/** Estrae e valida `mkt` dalla query string; valore non conforme → `null`. */
function readMarket(query: string): MarketCode | null {
  for (const pair of query.split('&')) {
    if (pair.length === 0) continue;
    const separator = pair.indexOf('=');
    const key = separator === -1 ? pair : pair.slice(0, separator);
    if (key !== 'mkt') continue;
    const value = safeDecode(separator === -1 ? '' : pair.slice(separator + 1));
    return isMarketCode(value) ? value : null;
  }
  return null;
}

/** Indice intero non negativo, altrimenti `null`. */
export function parseIndex(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) ? value : null;
}

/**
 * Parsa un hash in una `Route`. Qualsiasi input non riconosciuto ricade sulla griglia temi
 * (nessun throw, nessuna route "rotta").
 */
export function parseHash(hash: string | null | undefined): Route {
  const raw = (hash ?? '').replace(/^#/, '').trim();
  const { path, query } = splitPath(raw);
  const market = readMarket(query);
  const segments = path.split('/').filter((segment) => segment.length > 0);

  if (segments.length === 0 || segments[0] !== 'tema') {
    return { kind: 'themes', market };
  }

  if (segments.length > 3) {
    return { kind: 'themes', market };
  }

  const rawKey = segments[1];
  if (rawKey === undefined || rawKey.length === 0) {
    return { kind: 'themes', market };
  }

  const themeKey = safeDecode(rawKey);
  if (themeKey.length === 0) {
    return { kind: 'themes', market };
  }

  const rawIndex = segments[2];
  const index = rawIndex === undefined ? null : parseIndex(rawIndex);

  return { kind: 'theme', market, themeKey, index };
}

/** Serializza una `Route` in hash canonico: `#/tema/travel/3?mkt=it-IT`. */
export function serializeRoute(route: Route): string {
  const segments: string[] = [];
  if (route.kind === 'theme') {
    segments.push('tema', encodeURIComponent(route.themeKey));
    if (route.index !== null) segments.push(String(route.index));
  }
  const path = segments.length > 0 ? `/${segments.join('/')}` : '/';
  const market = route.market && isMarketCode(route.market) ? route.market : null;
  const query = market ? `mkt=${encodeURIComponent(market)}` : '';
  return `#${path}${query ? `?${query}` : ''}`;
}

/** `href` utilizzabile in un `<a>` per navigare a una route. */
export function routeHref(route: Route): string {
  return serializeRoute(route);
}

/** Route corrente ma con un altro market (usato dal selettore market). */
export function withMarket(route: Route, market: MarketCode): Route {
  return route.kind === 'theme'
    ? { kind: 'theme', market, themeKey: route.themeKey, index: route.index }
    : { kind: 'themes', market };
}

/** Route del dettaglio tema, opzionalmente con lightbox aperta su `index`. */
export function themeRoute(themeKey: ThemeKey, market: MarketCode | null, index: number | null = null): ThemeRoute {
  return { kind: 'theme', themeKey, market, index };
}

/** Route del dettaglio con lightbox aperta su una certa immagine. */
export function themeImageRoute(
  themeKey: ThemeKey,
  market: MarketCode | null,
  index: number | null,
): ThemeRoute {
  return { kind: 'theme', themeKey, market, index };
}

/** Confronta due route sul percorso (market incluso); utile per gli effect. */
export function sameRoute(a: Route, b: Route): boolean {
  return serializeRoute(a) === serializeRoute(b);
}
