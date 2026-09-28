import { api, ApiError } from '../api/client';
import type { MarketCode, ThemeListResponse } from '../api/types';
import { t } from '../lib/i18n';
import { useFetch } from './useFetch';
import type { AsyncState } from './useFetch';

/** Elenco temi per market (`GET /api/themes?mkt=`). */
export function useThemes(market: MarketCode | null): AsyncState<ThemeListResponse> {
  const enabled = market !== null;

  return useFetch<ThemeListResponse>(
    (signal) => {
      if (market === null) return Promise.reject(new ApiError('BAD_REQUEST', t.errorThemes, 400));
      return api.getThemes(market, signal);
    },
    [market],
    { enabled },
  );
}
