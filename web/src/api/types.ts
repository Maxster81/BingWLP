/**
 * Tipi del contratto API — rispecchiano `docs/API.md` (frozen v1).
 * Ogni nome di campo è vincolante: non rinominare senza aggiornare il contratto.
 */

export type MarketCode = string;
export type ThemeKey = string;
export type ThemeType = 'Regular' | 'ThemePack';

export type Theme = {
  key: ThemeKey;
  name: string;
  type: ThemeType;
  isNew: boolean;
  imageCount: number | null;
  coverUrl: string | null;
};

export type ImageUrls = {
  thumb: string;
  card: string;
  preview: string;
  full: string;
  original: string;
};

export type AnimatedAsset = {
  name: string;
  posterUrl: string;
  videoUrl: string;
};

export type WallpaperImage = {
  index: number;
  id: string;
  title: string;
  description: string;
  headline: string;
  copyright: string;
  copyrightUrl: string | null;
  searchUrl: string | null;
  startDate: string;
  themes: string[];
  sourceType: string;
  animated: AnimatedAsset | null;
  urls: ImageUrls;
  downloadBase: string;
};

export type ResolutionGroup = 'original' | 'desktop' | 'ultrawide' | 'mobile' | 'tablet';

export type Resolution = {
  key: string;
  label: string;
  group: ResolutionGroup;
  width: number;
  height: number;
  aspect: string;
  recommended?: boolean;
};

export type Market = {
  code: MarketCode;
  name: string;
  flag: string;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

/** `GET /api/config` */
export type ConfigResponse = {
  defaultMarket: MarketCode;
  markets: Market[];
  resolutions: Resolution[];
  defaultResolution: string;
  limits: { maxWidth: number; maxHeight: number };
  cacheTtlSec: { themes: number; images: number };
};

/** `GET /api/themes?mkt=` */
export type ThemeListResponse = {
  market: MarketCode;
  fetchedAt: string;
  stale: boolean;
  count: number;
  themes: Theme[];
};

export type ThemeSummary = {
  key: ThemeKey;
  name: string;
  type: ThemeType;
  isNew: boolean;
};

/** `GET /api/themes/{key}/images?mkt=` */
export type ThemeImagesResponse = {
  market: MarketCode;
  fetchedAt: string;
  stale: boolean;
  theme: ThemeSummary;
  count: number;
  images: WallpaperImage[];
};

/** `GET /api/resolutions` */
export type ResolutionsResponse = {
  default: string;
  resolutions: Resolution[];
};

/** `GET /api/health` */
export type HealthResponse = {
  status: string;
  version: string;
  uptimeSec: number;
  upstream: string;
  cache: { themes: number; images: number; entries: number };
  timestamp: string;
};

/** Codici errore del contratto (unionali chiusi lato client per autocomplete). */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'THEME_NOT_FOUND'
  | 'IMAGE_NOT_FOUND'
  | 'RATE_LIMITED'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE'
  | 'NETWORK_ERROR'
  | 'ABORTED'
  | 'UNKNOWN';
