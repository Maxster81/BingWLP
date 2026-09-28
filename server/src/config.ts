import { z } from 'zod';

export type ImageStoreKind = 'null' | 'fs';

/** Configurazione runtime del backend, derivata dalle env con default del contratto. */
export type AppConfig = {
  host: string;
  port: number;
  defaultMarket: string;
  bingApiBase: string;
  bingCdnBase: string;
  cacheTtlThemesSec: number;
  cacheTtlImagesSec: number;
  cacheImageBytes: number;
  upstreamTimeoutMs: number;
  serveStatic: boolean;
  staticDir: string;
  imageStore: ImageStoreKind;
  imageStoreDir: string;
  allowOrigins: string[];
  rateLimitMax: number;
  logLevel: string;
  nodeEnv: string;
};

/** Default della tabella in docs/API.md (.env.example per CACHE_IMAGE_BYTES). */
export const CONFIG_DEFAULTS = {
  host: '0.0.0.0',
  port: 8080,
  defaultMarket: 'it-IT',
  bingApiBase: 'https://services.bingapis.com/ge-apps/api/v2',
  bingCdnBase: 'https://www.bing.com/th',
  cacheTtlThemesSec: 21600,
  cacheTtlImagesSec: 3600,
  cacheImageBytes: 2147483648, // 2 GiB — non usato in questa iterazione (store null)
  upstreamTimeoutMs: 8000,
  serveStatic: true,
  staticDir: '../web/dist',
  imageStore: 'null' as ImageStoreKind,
  imageStoreDir: './data/images',
  rateLimitMax: 0,
  logLevel: 'info',
} as const;

const TRUE_VALUES = ['1', 'true', 'yes', 'on'];
const FALSE_VALUES = ['0', 'false', 'no', 'off', ''];

/**
 * Ogni variabile è letta in modo tollerante: valore assente o non valido → default,
 * quindi `loadConfig` non lancia mai. Le variabili extra presenti nell'ambiente
 * vengono semplicemente ignorate (zod le scarta senza errore).
 */
const envSchema = z
  .object({
    HOST: z.string().trim().min(1).catch(CONFIG_DEFAULTS.host),
    PORT: z.coerce.number().int().min(1).max(65535).catch(CONFIG_DEFAULTS.port),
    DEFAULT_MARKET: z.string().trim().min(1).catch(CONFIG_DEFAULTS.defaultMarket),
    BING_API_BASE: z
      .string()
      .trim()
      .min(1)
      .transform(stripTrailingSlash)
      .catch(CONFIG_DEFAULTS.bingApiBase),
    BING_CDN_BASE: z
      .string()
      .trim()
      .min(1)
      .transform(stripTrailingSlash)
      .catch(CONFIG_DEFAULTS.bingCdnBase),
    CACHE_TTL_THEMES_SEC: z.coerce
      .number()
      .int()
      .min(0)
      .catch(CONFIG_DEFAULTS.cacheTtlThemesSec),
    CACHE_TTL_IMAGES_SEC: z.coerce
      .number()
      .int()
      .min(0)
      .catch(CONFIG_DEFAULTS.cacheTtlImagesSec),
    CACHE_IMAGE_BYTES: z.coerce.number().int().min(0).catch(CONFIG_DEFAULTS.cacheImageBytes),
    UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(1).catch(CONFIG_DEFAULTS.upstreamTimeoutMs),
    SERVE_STATIC: boolVar(CONFIG_DEFAULTS.serveStatic),
    STATIC_DIR: z.string().trim().min(1).catch(CONFIG_DEFAULTS.staticDir),
    IMAGE_STORE: z.enum(['null', 'fs']).catch(CONFIG_DEFAULTS.imageStore),
    IMAGE_STORE_DIR: z.string().trim().min(1).catch(CONFIG_DEFAULTS.imageStoreDir),
    ALLOW_ORIGINS: z
      .string()
      .catch('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      ),
    RATE_LIMIT_MAX: z.coerce.number().int().min(0).catch(CONFIG_DEFAULTS.rateLimitMax),
    LOG_LEVEL: z.string().trim().min(1).catch(CONFIG_DEFAULTS.logLevel),
    NODE_ENV: z.string().trim().catch('development'),
  })
  .strip();

export type EnvLike = Record<string, string | undefined>;

/** Legge l'ambiente (default `process.env`) e ritorna la config tipizzata. */
export function loadConfig(env: EnvLike = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  // `safeParse` non dovrebbe mai fallire (ogni campo ha `.catch`), ma per sicurezza
  // in caso di schema incoerente si ricade sui soli default.
  const raw = parsed.success ? parsed.data : envSchema.parse({});

  return {
    host: raw.HOST,
    port: raw.PORT,
    defaultMarket: raw.DEFAULT_MARKET,
    bingApiBase: raw.BING_API_BASE,
    bingCdnBase: raw.BING_CDN_BASE,
    cacheTtlThemesSec: raw.CACHE_TTL_THEMES_SEC,
    cacheTtlImagesSec: raw.CACHE_TTL_IMAGES_SEC,
    cacheImageBytes: raw.CACHE_IMAGE_BYTES,
    upstreamTimeoutMs: raw.UPSTREAM_TIMEOUT_MS,
    serveStatic: raw.SERVE_STATIC,
    staticDir: raw.STATIC_DIR,
    imageStore: raw.IMAGE_STORE,
    imageStoreDir: raw.IMAGE_STORE_DIR,
    allowOrigins: raw.ALLOW_ORIGINS,
    rateLimitMax: raw.RATE_LIMIT_MAX,
    logLevel: raw.LOG_LEVEL,
    nodeEnv: raw.NODE_ENV,
  };
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function boolVar(fallback: boolean) {
  return z
    .string()
    .transform((value, ctx) => {
      const normalized = value.trim().toLowerCase();
      if (TRUE_VALUES.includes(normalized)) return true;
      if (FALSE_VALUES.includes(normalized)) return false;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'booleano non valido' });
      return z.NEVER;
    })
    .catch(fallback);
}
