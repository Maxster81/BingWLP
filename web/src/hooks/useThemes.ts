import { useRef } from 'react';
import { api, ApiError } from '../api/client';
import type { MarketCode, ThemeListResponse } from '../api/types';
import { t } from '../lib/i18n';
import { useFetch } from './useFetch';
import type { AsyncState } from './useFetch';

/**
 * Elenco temi per market (`GET /api/themes?mkt=`).
 * Quando `refreshNonce` cambia (pulsante "Aggiorna"), la prossima richiesta
 * porta `refresh=1`: bypassa la cache TTL del server.
 */
export function useThemes(market: MarketCode | null, refreshNonce = 0): AsyncState<ThemeListResponse> {
  const enabled = market !== null;
  const lastNonceRef = useRef(refreshNonce);

  return useFetch<ThemeListResponse>(
    (signal) => {
      if (market === null) return Promise.reject(new ApiError('BAD_REQUEST', t.errorThemes, 400));
      const forceRefresh = refreshNonce !== lastNonceRef.current;
      lastNonceRef.current = refreshNonce;
      return api.getThemes(market, signal, forceRefresh);
    },
    [market, refreshNonce],
    { enabled },
  );
}
