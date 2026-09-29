import type { z } from 'zod';
import type { AppConfig } from '../config';
import type { UpstreamStatus } from '../domain/types';
import { AppError, upstreamError, upstreamTimeout, upstreamUnavailable } from '../errors';
import type { LoggerLike } from '../logger';
import {
  bingImagesSchema,
  bingThemeCategoriesSchema,
  type BingImagesResponse,
  type BingThemeCategoriesResponse,
} from './types';

/**
 * Client verso le API Bing.
 *
 * Esposto come interfaccia così i test (e in futuro eventuali cache esterne)
 * possono iniettare un fake: **nessuna chiamata di rete nei test**.
 */
export interface BingClient {
  getThemeCategories(mkt: string): Promise<BingThemeCategoriesResponse>;
  getThemeImages(mkt: string, themeKey: string): Promise<BingImagesResponse>;
  /** Esito dei giri recenti, per /api/health. */
  getUpstreamStatus(): UpstreamStatus;
}

export type HttpBingClientOptions = {
  config: AppConfig;
  logger?: LoggerLike;
  /** Iniettabile nei test; default `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
  /** Base del backoff esponenziale fra i retry (default 200ms). */
  retryBaseDelayMs?: number;
  /** Numero di retry massimo (default 2). */
  maxRetries?: number;
  /** Quanti esiti recenti considerare per lo status (default 20). */
  outcomeWindow?: number;
};

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 200;
const DEFAULT_OUTCOME_WINDOW = 20;

export class HttpBingClient implements BingClient {
  private readonly apiBase: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;
  private readonly outcomeWindow: number;
  /** `true` = successo, `false` = fallimento; finestra scorrevole dei giri recenti. */
  private readonly outcomes: boolean[] = [];
  private logger: LoggerLike | undefined;

  constructor(options: HttpBingClientOptions) {
    this.apiBase = options.config.bingApiBase;
    this.timeoutMs = options.config.upstreamTimeoutMs;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
    this.outcomeWindow = Math.max(1, options.outcomeWindow ?? DEFAULT_OUTCOME_WINDOW);
    this.logger = options.logger;
  }

  /** Fastify crea il logger dopo `buildApp`: l'index lo collega qui al bootstrap. */
  setLogger(logger: LoggerLike | undefined): void {
    this.logger = logger;
  }

  getThemeCategories(mkt: string): Promise<BingThemeCategoriesResponse> {
    const url = `${this.apiBase}/BWC/GetThemeCategories?mkt=${encodeURIComponent(mkt)}`;
    return this.requestJson(url, bingThemeCategoriesSchema, `categorie ${mkt}`);
  }

  getThemeImages(mkt: string, themeKey: string): Promise<BingImagesResponse> {
    const url = `${this.apiBase}/bwc/hpimages?mkt=${encodeURIComponent(mkt)}&theme=${encodeURIComponent(themeKey)}`;
    return this.requestJson(url, bingImagesSchema, `immagini ${mkt}/${themeKey}`);
  }

  /**
   * `ok` = nessun errore nella finestra recente; `degraded` = alcuni errori;
   * `down` = tutti gli ultimi giri falliti (nessun giro ancora effettuato → `ok`).
   */
  getUpstreamStatus(): UpstreamStatus {
    if (this.outcomes.length === 0) return 'ok';
    const failures = this.outcomes.filter((ok) => !ok).length;
    if (failures === 0) return 'ok';
    if (failures === this.outcomes.length) return 'down';
    return 'degraded';
  }

  private async requestJson<T>(url: string, schema: z.ZodType<T>, context: string): Promise<T> {
    let lastError: AppError = upstreamUnavailable(`Bing non raggiungibile (${context})`);

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) {
        const delayMs = this.backoffMs(attempt);
        this.logger?.warn(
          `Retry ${attempt}/${this.maxRetries} verso Bing (${context}) fra ${delayMs}ms: ${lastError.message}`,
        );
        await sleep(delayMs);
      }
      try {
        const data = await this.fetchOnce(url, schema, context);
        this.recordOutcome(true);
        return data;
      } catch (error) {
        lastError =
          error instanceof AppError
            ? error
            : upstreamUnavailable(`Bing non raggiungibile (${context})`, error);
        // Retry solo su errori transitori (rete/timeout/5xx), mai su 4xx o payload invalido.
        if (!lastError.retryable || attempt === this.maxRetries) break;
      }
    }

    this.recordOutcome(false);
    throw lastError;
  }

  private async fetchOnce<T>(url: string, schema: z.ZodType<T>, context: string): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      if (isAbortLike(error)) {
        throw upstreamTimeout(`Timeout di ${this.timeoutMs}ms verso Bing (${context})`, {
          retryable: true,
          cause: error,
        });
      }
      throw upstreamUnavailable(`Bing non raggiungibile (${context})`, error);
    }

    if (!response.ok) {
      throw upstreamError(`Bing ha risposto ${response.status} (${context})`, {
        retryable: response.status >= 500,
      });
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw upstreamError(`Risposta Bing non leggibile (${context})`, { cause: error });
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw upstreamError(`Risposta Bing non conforme (${context})`);
    }
    return parsed.data;
  }

  private backoffMs(attempt: number): number {
    const exponential = this.retryBaseDelayMs * 2 ** (attempt - 1);
    const jitter = Math.floor(Math.random() * Math.max(1, this.retryBaseDelayMs / 4));
    return exponential + jitter;
  }

  private recordOutcome(ok: boolean): void {
    this.outcomes.push(ok);
    while (this.outcomes.length > this.outcomeWindow) this.outcomes.shift();
  }
}

function isAbortLike(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.name === 'TimeoutError';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref();
  });
}
