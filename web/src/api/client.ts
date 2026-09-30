import type {
  ApiErrorBody,
  ApiErrorCode,
  ConfigResponse,
  MarketCode,
  ResolutionsResponse,
  ThemeImagesResponse,
  ThemeKey,
  ThemeListResponse,
} from './types';
import { configUrl, downloadUrl, imageUrl, resolutionsUrl, themeImagesUrl, themesUrl } from '../lib/urls';

/** Errore uniforme del client: rispetta la forma `{ error: { code, message } }` del contratto. */
export class ApiError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }

  /** `true` se l'errore non è un problema dell'utente (5xx / rete) e vale la pena riprovare. */
  get isRetryable(): boolean {
    return this.status === 0 || this.status >= 500 || this.status === 429;
  }
}

export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/** Estrae `{error:{code,message}}` da un body arbitrario, con fallback prudente. */
function parseErrorBody(body: unknown, status: number): ApiError {
  if (typeof body === 'object' && body !== null && 'error' in body) {
    const { error } = body as ApiErrorBody;
    if (error && typeof error.code === 'string' && typeof error.message === 'string') {
      return new ApiError(error.code, error.message, status);
    }
  }
  return new ApiError('UNKNOWN', `Richiesta non riuscita (HTTP ${status}).`, status);
}

/** Legge il body come JSON senza mai lanciare: utile per le risposte di errore. */
async function safeJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

type RequestOptions = {
  signal?: AbortSignal;
  /** Se `true`, un abort produce comunque un rifiuto `ApiError` (default: `DOMException`). */
  wrapAbort?: boolean;
};

/**
 * Wrapper `fetch` tipizzato, same-origin, con URL relativi `/api/...`.
 * Gestione errori uniforme: HTTP non-2xx → `ApiError` con `code`/`status`.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { signal, wrapAbort = false } = options;

  let response: Response;
  try {
    response = await fetch(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (cause) {
    if (signal?.aborted) {
      if (wrapAbort) throw new ApiError('ABORTED', 'Richiesta annullata.', 0);
      throw cause;
    }
    throw new ApiError('NETWORK_ERROR', 'Impossibile contattare il server.', 0);
  }

  if (!response.ok) {
    throw parseErrorBody(await safeJson(response), response.status);
  }

  return (await response.json()) as T;
}

/** API di alto livello usata dagli hook: un metodo per endpoint + helper URL. */
export const api = {
  getConfig(signal?: AbortSignal): Promise<ConfigResponse> {
    return request<ConfigResponse>(configUrl(), { signal });
  },

  getThemes(market: MarketCode, signal?: AbortSignal, refresh = false): Promise<ThemeListResponse> {
    return request<ThemeListResponse>(themesUrl(market, refresh), { signal });
  },

  getThemeImages(market: MarketCode, themeKey: ThemeKey, signal?: AbortSignal, refresh = false): Promise<ThemeImagesResponse> {
    return request<ThemeImagesResponse>(themeImagesUrl(market, themeKey, refresh), { signal });
  },

  getResolutions(signal?: AbortSignal): Promise<ResolutionsResponse> {
    return request<ResolutionsResponse>(resolutionsUrl(), { signal });
  },

  /** URL relativo per un'immagine (`/api/image?...`). */
  imageUrl,
  /** URL relativo di download: `downloadBase + "&res=" + key`. */
  downloadUrl,
};

export type { ConfigResponse, ResolutionsResponse, ThemeImagesResponse, ThemeListResponse };
export { imageUrl, downloadUrl };
