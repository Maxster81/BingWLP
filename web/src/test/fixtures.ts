import type {
  ConfigResponse,
  Market,
  Resolution,
  Theme,
  ThemeImagesResponse,
  ThemeListResponse,
  WallpaperImage,
} from '../api/types';
import { imageUrl } from '../lib/urls';

/**
 * Fixture di test — rispettano ESATTAMENTE le forme di `docs/API.md`.
 * Nessuna rete: sono oggetti puri usati dai mock di `fetch`.
 */

export function makeTheme(overrides: Partial<Theme> = {}): Theme {
  return {
    key: 'travel',
    name: 'Viaggi',
    type: 'Regular',
    isNew: false,
    imageCount: 4,
    coverUrl: imageUrl({ theme: 'travel', index: 0, market: 'it-IT', width: 800, height: 450 }),
    ...overrides,
  };
}

export function makeImage(index: number, overrides: Partial<WallpaperImage> = {}): WallpaperImage {
  const theme = 'travel';
  return {
    index,
    id: `OBGA.IMAGE_${index}`,
    title: `Panorama ${index + 1}`,
    description: `Descrizione dell'immagine ${index + 1}.`,
    headline: `Headline ${index + 1}`,
    copyright: '© /Shutterstock',
    copyrightUrl: 'https://www.bing.com/credits',
    searchUrl: 'https://www.bing.com/search?q=travel',
    startDate: `Travel_${100 + index}`,
    themes: ['travel', 'nature'],
    sourceType: 'StockImage',
    animated: null,
    urls: {
      thumb: imageUrl({ theme, index, width: 480, height: 270 }),
      card: imageUrl({ theme, index, width: 800, height: 450 }),
      preview: imageUrl({ theme, index, width: 1280, height: 720 }),
      full: imageUrl({ theme, index, width: 1920, height: 1080 }),
      original: imageUrl({ theme, index }),
    },
    downloadBase: `/api/download?mkt=it-IT&theme=${theme}&i=${index}`,
    ...overrides,
  };
}

export function makeResolution(overrides: Partial<Resolution> = {}): Resolution {
  return {
    key: '1920x1080',
    label: 'Full HD (1920×1080)',
    group: 'desktop',
    width: 1920,
    height: 1080,
    aspect: '16:9',
    recommended: true,
    ...overrides,
  };
}

export function makeResolutions(): Resolution[] {
  return [
    makeResolution({
      key: 'original',
      label: 'Originale (nativa)',
      group: 'original',
      width: 0,
      height: 0,
      aspect: 'nativa',
      recommended: false,
    }),
    makeResolution({ key: '1920x1080', label: 'Full HD (1920×1080)', group: 'desktop' }),
    makeResolution({
      key: '3840x2160',
      label: 'Ultra HD (3840×2160)',
      group: 'desktop',
      width: 3840,
      height: 2160,
      recommended: false,
    }),
    makeResolution({
      key: '1080x1920',
      label: 'Smartphone (1080×1920)',
      group: 'mobile',
      width: 1080,
      height: 1920,
      aspect: '9:16',
      recommended: false,
    }),
  ];
}

export function makeMarkets(): Market[] {
  return [
    { code: 'it-IT', name: 'Italiano (Italia)', flag: '🇮🇹' },
    { code: 'en-US', name: 'English (United States)', flag: '🇺🇸' },
  ];
}

export function makeConfig(overrides: Partial<ConfigResponse> = {}): ConfigResponse {
  return {
    defaultMarket: 'it-IT',
    markets: makeMarkets(),
    resolutions: makeResolutions(),
    defaultResolution: '1920x1080',
    limits: { maxWidth: 8000, maxHeight: 8000 },
    cacheTtlSec: { themes: 21600, images: 3600 },
    ...overrides,
  };
}

export function makeThemesResponse(themes: Theme[] = []): ThemeListResponse {
  const list =
    themes.length > 0
      ? themes
      : [
          makeTheme({ key: 'travel', name: 'Viaggi', imageCount: 4 }),
          makeTheme({ key: 'wild animal', name: 'Animali selvatici', isNew: true, imageCount: null, coverUrl: null }),
        ];
  return {
    market: 'it-IT',
    fetchedAt: '2026-01-01T10:00:00.000Z',
    stale: false,
    count: list.length,
    themes: list,
  };
}

export function makeImagesResponse(count = 4, overrides: Partial<ThemeImagesResponse> = {}): ThemeImagesResponse {
  return {
    market: 'it-IT',
    fetchedAt: '2026-01-01T10:00:00.000Z',
    stale: false,
    theme: { key: 'travel', name: 'Viaggi', type: 'Regular', isNew: false },
    count,
    images: Array.from({ length: count }, (_, index) => makeImage(index)),
    ...overrides,
  };
}
