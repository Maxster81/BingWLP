import type { BingClient } from '../bing/client';
import { mapThemeCategories, mapThemeImages } from '../bing/mappers';
import { TtlCache } from '../cache/ttl-cache';
import type { AppConfig } from '../config';
import type { CacheStats, Theme, ThemeSummary, WallpaperImage } from '../domain/types';
import { AppError, describeError, imageNotFound, themeNotFound, upstreamUnavailable } from '../errors';
import type { LoggerLike } from '../logger';

/** Payload messi in cache: valore + istante di fetch (per `fetchedAt` nelle risposte). */
export type ThemesPayload = { themes: ThemeSummary[]; fetchedAt: number };
export type ImagesPayload = { images: WallpaperImage[]; fetchedAt: number };

export type GalleryDeps = {
  config: AppConfig;
  bing: BingClient;
  logger?: LoggerLike;
  themeCache?: TtlCache<ThemesPayload>;
  imageCache?: TtlCache<ImagesPayload>;
  /** Limite di concorrenza verso Bing nell'arricchimento dei temi (default 4). */
  concurrency?: number;
};

export type ThemeListItem = Theme & { images?: WallpaperImage[] };

export type ThemesResult = {
  market: string;
  fetchedAt: string;
  stale: boolean;
  count: number;
  themes: ThemeListItem[];
};

export type ThemeImagesResult = {
  market: string;
  fetchedAt: string;
  stale: boolean;
  theme: ThemeSummary;
  count: number;
  images: WallpaperImage[];
};

export type ImageEntry = {
  theme: ThemeSummary;
  image: WallpaperImage;
  stale: boolean;
  fetchedAt: string;
};

export type FetchOptions = {
  refresh?: boolean;
  includeImages?: boolean;
};

const DEFAULT_CONCURRENCY = 4;

type Loaded<T> = { payload: T; stale: boolean };

/**
 * Orchestrazione della galleria: cache TTL + client Bing + mapper.
 *
 * Regole di degradazione (docs/API.md):
 * - cache fresca → risposta senza chiamate upstream;
 * - cache scaduta + upstream KO → si risponde con la cache e `stale: true`;
 * - nessuna cache + upstream KO → errore (503 UPSTREAM_UNAVAILABLE, oppure il codice
 *   specifico del client: 504 timeout / 502 risposta errata);
 * - in `/api/themes` il fallimento di un singolo tema NON fa fallire la risposta:
 *   quel tema ha `imageCount: null`, `coverUrl: null` e la risposta è `stale: true`.
 */
export class Gallery {
  private readonly config: AppConfig;
  private readonly bing: BingClient;
  private readonly logger: LoggerLike | undefined;
  private readonly themeCache: TtlCache<ThemesPayload>;
  private readonly imageCache: TtlCache<ImagesPayload>;
  private readonly concurrency: number;

  constructor(deps: GalleryDeps) {
    this.config = deps.config;
    this.bing = deps.bing;
    this.logger = deps.logger;
    this.themeCache = deps.themeCache ?? new TtlCache<ThemesPayload>({ maxEntries: 50 });
    this.imageCache = deps.imageCache ?? new TtlCache<ImagesPayload>({ maxEntries: 200 });
    this.concurrency = Math.max(1, deps.concurrency ?? DEFAULT_CONCURRENCY);
  }

  /** Statistiche per /api/health. */
  cacheStats(): CacheStats {
    const themes = this.themeCache.stats().entries;
    const images = this.imageCache.stats().entries;
    return { themes, images, entries: themes + images };
  }

  /** Elenco temi con `imageCount` e `coverUrl` calcolati in parallelo (concorrenza limitata). */
  async getThemes(market: string, options: FetchOptions = {}): Promise<ThemesResult> {
    const { payload: categories, stale: categoriesStale } = await this.loadCategories(
      market,
      options.refresh === true,
    );

    const enriched = await mapWithConcurrency(
      categories.themes,
      this.concurrency,
      async (theme): Promise<{ theme: ThemeSummary; images: WallpaperImage[] | null; stale: boolean }> => {
        try {
          const { payload, stale } = await this.loadImages(market, theme, options.refresh === true);
          return { theme, images: payload.images, stale };
        } catch (error) {
          this.logger?.warn(`Immagini non disponibili per "${theme.key}" (${market}): ${describeError(error)}`);
          return { theme, images: null, stale: true };
        }
      },
    );

    let stale = categoriesStale;
    const themes: ThemeListItem[] = enriched.map(({ theme, images, stale: themeStale }) => {
      if (images === null) {
        stale = true;
        return { ...theme, imageCount: null, coverUrl: null };
      }
      if (themeStale) stale = true;
      const first = images[0];
      return {
        ...theme,
        imageCount: images.length,
        coverUrl: first ? first.urls.card : null,
        ...(options.includeImages === true ? { images } : {}),
      };
    });

    return {
      market,
      fetchedAt: toIso(categories.fetchedAt),
      stale,
      count: themes.length,
      themes,
    };
  }

  /** Immagini di un tema; 404 THEME_NOT_FOUND se la key non esiste per quel market. */
  async getThemeImages(
    market: string,
    themeKey: string,
    options: FetchOptions = {},
  ): Promise<ThemeImagesResult> {
    const { payload: categories, stale: categoriesStale } = await this.loadCategories(
      market,
      options.refresh === true,
    );
    const theme = categories.themes.find((candidate) => candidate.key === themeKey);
    if (!theme) throw themeNotFound(themeKey, market);

    const { payload, stale } = await this.loadImages(market, theme, options.refresh === true);
    return {
      market,
      fetchedAt: toIso(payload.fetchedAt),
      stale: stale || categoriesStale,
      theme,
      count: payload.images.length,
      images: payload.images,
    };
  }

  /** Immagine per indice: usata da /api/image e /api/download. */
  async getImageEntry(market: string, themeKey: string, index: number): Promise<ImageEntry> {
    const result = await this.getThemeImages(market, themeKey);
    const image = result.images[index];
    if (!image) throw imageNotFound(themeKey, index);
    return { theme: result.theme, image, stale: result.stale, fetchedAt: result.fetchedAt };
  }

  private async loadCategories(market: string, refresh: boolean): Promise<Loaded<ThemesPayload>> {
    const key = `themes:${market}`;
    const cached = this.themeCache.get(key);
    if (!refresh && cached && !cached.stale) return { payload: cached.value, stale: false };

    try {
      const raw = await this.bing.getThemeCategories(market);
      const payload: ThemesPayload = { themes: mapThemeCategories(raw), fetchedAt: Date.now() };
      this.themeCache.set(key, payload, this.config.cacheTtlThemesSec);
      return { payload, stale: false };
    } catch (error) {
      this.logger?.warn(`Temi non aggiornati per ${market}: ${describeError(error)}`);
      if (cached) return { payload: cached.value, stale: true };
      throw toUpstreamFailure(error, `recuperare i temi per ${market}`);
    }
  }

  private async loadImages(
    market: string,
    theme: ThemeSummary,
    refresh: boolean,
  ): Promise<Loaded<ImagesPayload>> {
    const key = `images:${market}:${theme.key}`;
    const cached = this.imageCache.get(key);
    if (!refresh && cached && !cached.stale) return { payload: cached.value, stale: false };

    try {
      const raw = await this.bing.getThemeImages(market, theme.key);
      const payload: ImagesPayload = {
        images: mapThemeImages(raw, {
          themeKey: theme.key,
          market,
          themeName: theme.name,
          themeType: theme.type,
          isNew: theme.isNew,
          ...(this.logger ? { logger: this.logger } : {}),
        }),
        fetchedAt: Date.now(),
      };
      this.imageCache.set(key, payload, this.config.cacheTtlImagesSec);
      return { payload, stale: false };
    } catch (error) {
      this.logger?.warn(`Immagini non aggiornate per "${theme.key}" (${market}): ${describeError(error)}`);
      if (cached) return { payload: cached.value, stale: true };
      throw toUpstreamFailure(error, `recuperare le immagini di "${theme.key}" (${market})`);
    }
  }
}

/** Propaga il codice d'errore del client (502/504) o degrada a 503 se non è un AppError. */
function toUpstreamFailure(error: unknown, action: string): AppError {
  if (error instanceof AppError) return error;
  return upstreamUnavailable(`Impossibile ${action}: Bing non raggiungibile`, error);
}

function toIso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

/** Mappa in parallelo con concorrenza limitata, preservando l'ordine dei risultati. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const current = cursor;
        cursor += 1;
        if (current >= items.length) return;
        const item = items[current];
        if (item === undefined) return;
        results[current] = await fn(item, current);
      }
    }),
  );

  return results;
}
