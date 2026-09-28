import { z } from 'zod';

/** Codici di errore del contratto (docs/API.md → tabella errori). */
export type AppErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'THEME_NOT_FOUND'
  | 'IMAGE_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'INTERNAL_ERROR';

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  THEME_NOT_FOUND: 404,
  IMAGE_NOT_FOUND: 404,
  RATE_LIMITED: 429,
  UPSTREAM_ERROR: 502,
  UPSTREAM_TIMEOUT: 504,
  UPSTREAM_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export type AppErrorOptions = {
  statusCode?: number;
  /** `true` solo per errori transitori (rete, 5xx): abilita il retry nel client Bing. */
  retryable?: boolean;
  cause?: unknown;
};

/** Errore applicativo: diventa `{ error: { code, message } }` con lo status mappato. */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly statusCode: number;
  readonly retryable: boolean;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = options.statusCode ?? STATUS_BY_CODE[code];
    this.retryable = options.retryable ?? false;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  toJSON(): ErrorPayload {
    return { error: { code: this.code, message: this.message } };
  }
}

export type ErrorPayload = {
  error: { code: AppErrorCode; message: string };
};

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function badRequest(message: string): AppError {
  return new AppError('BAD_REQUEST', message);
}

export function notFound(message = 'Risorsa non trovata'): AppError {
  return new AppError('NOT_FOUND', message);
}

export function themeNotFound(themeKey: string, market: string): AppError {
  return new AppError('THEME_NOT_FOUND', `Tema "${themeKey}" non trovato per il market ${market}`);
}

export function imageNotFound(themeKey: string, index: number): AppError {
  return new AppError('IMAGE_NOT_FOUND', `Immagine #${index} non trovata nel tema "${themeKey}"`);
}

export function upstreamError(message: string, options: AppErrorOptions = {}): AppError {
  return new AppError('UPSTREAM_ERROR', message, options);
}

export function upstreamTimeout(message: string, options: AppErrorOptions = {}): AppError {
  return new AppError('UPSTREAM_TIMEOUT', message, options);
}

export function upstreamUnavailable(message: string, cause?: unknown): AppError {
  return new AppError('UPSTREAM_UNAVAILABLE', message, { retryable: true, cause });
}

export function rateLimited(message = 'Troppe richieste, riprova più tardi'): AppError {
  return new AppError('RATE_LIMITED', message);
}

/** Normalizza qualunque throwable nel payload d'errore del contratto. */
export function toErrorResponse(error: unknown): { statusCode: number; payload: ErrorPayload } {
  if (isAppError(error)) {
    return { statusCode: error.statusCode, payload: error.toJSON() };
  }
  return {
    statusCode: 500,
    payload: { error: { code: 'INTERNAL_ERROR', message: 'Errore interno del server' } },
  };
}

/**
 * Valida `input` con zod; in caso di problemi lancia un 400 BAD_REQUEST con
 * messaggio leggibile (nome del parametro non valido).
 */
export function parseOrBadRequest<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  label = 'parametri',
): z.infer<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join('.') ?? '';
    const detail = issue?.message ? ` (${issue.message})` : '';
    throw badRequest(path ? `${label} non validi: "${path}"${detail}` : `${label} non validi${detail}`);
  }
  return result.data;
}

/** Descrizione breve di un errore, per i log. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}
