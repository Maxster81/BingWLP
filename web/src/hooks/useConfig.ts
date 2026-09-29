import { api } from '../api/client';
import type { ConfigResponse } from '../api/types';
import { useFetch } from './useFetch';
import type { AsyncState } from './useFetch';

/** Configurazione statica dell'app: una sola chiamata all'avvio (`GET /api/config`). */
export function useConfig(): AsyncState<ConfigResponse> {
  return useFetch<ConfigResponse>((signal) => api.getConfig(signal), []);
}
