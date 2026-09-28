import { useCallback } from 'react';
import { api, ApiError } from '../api/client';
import type { MarketCode, ThemeImagesResponse, ThemeKey } from '../api/types';
import { t } from '../lib/i18n';
import { useFetch } from './useFetch';
import type { AsyncState } from './useFetch';

/**
 * Cache in-memory delle risposte `GET /api/themes/{key}/images`.
 * Vive per la durata della sessione (module scope, nessuno storage persistente):
 * tornando indietro da un tema non si rifà la richiesta di rete.
 */
const imageCache = new Map<string, ThemeImagesResponse>();

function cacheKeyOf(market: MarketCode | null, themeKey: ThemeKey | null): string {
  return `${market ?? ''}::${themeKey ?? ''}`;
}

/** Legge una risposta dalla cache senza innescare richieste. */
export function peekThemeImages(market: MarketCode | null, themeKey: ThemeKey | null): ThemeImagesResponse | null {
  if (market === null || themeKey === null) return null;
  return imageCache.get(cacheKeyOf(market, themeKey)) ?? null;
}

/** Precarica una risposta in cache (usata dai test e da eventuali prefetch). */
export function primeThemeImages(market: MarketCode, themeKey: ThemeKey, response: ThemeImagesResponse): void {
  imageCache.set(cacheKeyOf(market, themeKey), response);
}

/** Svuota la cache (i test la chiamano fra un caso e l'altro). */
export function clearThemeImagesCache(): void {
  imageCache.clear();
}

/**
 * Immagini di un tema con cache in-memory: al ritorno su un tema già visto
 * la risposta è disponibile subito e non viene rifatta la chiamata.
 */
export function useThemeImages(
  market: MarketCode | null,
  themeKey: ThemeKey | null,
): AsyncState<ThemeImagesResponse> {
  const enabled = market !== null && themeKey !== null;
  const cached = peekThemeImages(market, themeKey);

  const fetcher = useCallback(
    (signal: AbortSignal): Promise<ThemeImagesResponse> => {
      if (market === null || themeKey === null) {
        return Promise.reject(new ApiError('BAD_REQUEST', t.errorImages, 400));
      }
      const key = cacheKeyOf(market, themeKey);
      const hit = imageCache.get(key);
      if (hit) return Promise.resolve(hit);
      return api.getThemeImages(market, themeKey, signal).then((response) => {
        imageCache.set(key, response);
        return response;
      });
    },
    [market, themeKey],
  );

  return useFetch<ThemeImagesResponse>(fetcher, [market, themeKey], { enabled, initialData: cached });
}
