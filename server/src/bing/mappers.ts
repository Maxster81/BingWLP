import type { ThemeSummary, ThemeType, WallpaperImage, WallpaperImageUrls } from '../domain/types';
import type { LoggerLike } from '../logger';
import type { BingAnimatedAsset, BingImage, BingImagesResponse, BingThemeCategoriesResponse } from './types';

/**
 * Mapper PURI upstream → dominio (docs/API.md).
 *
 * Unica eccezione alla purezza: `ctx.logger` opzionale, usato per segnalare le immagini
 * scartate. Il risultato resta deterministico e i test possono passare un fake logger.
 */

const ID_QUERY_PATTERN = /[?&]id=([^&]+)/;
const VIDEO_EXTENSION = /\.(webm|mov)(\?|#|\s|$)/;
const HTML_ASSET = /\.html?(\?|#|\s|$)/;

/** Dimensioni delle anteprime richieste al backend (docs/API.md → WallpaperImage.urls). */
const SIZES = {
  thumb: { width: 480, height: 270 },
  card: { width: 800, height: 450 },
  preview: { width: 1280, height: 720 },
  full: { width: 1920, height: 1080 },
} as const;

export type ThemeImageContext = {
  themeKey: string;
  market: string;
  themeName: string;
  themeType: ThemeType;
  isNew: boolean;
  logger?: LoggerLike;
};

/**
 * Categorie → `ThemeSummary[]`.
 * Ordine: prima i `Type === "Regular"`, poi i `ThemePack`; dentro ogni gruppo l'ordine
 * upstream (Bing risponde con un oggetto e l'ordine delle chiavi è significativo).
 */
export function mapThemeCategories(raw: BingThemeCategoriesResponse): ThemeSummary[] {
  const regular: ThemeSummary[] = [];
  const themePacks: ThemeSummary[] = [];

  for (const [key, category] of Object.entries(raw ?? {})) {
    if (!key || category == null) continue;
    const type = normalizeThemeType(category.Type);
    const name = typeof category.Name === 'string' && category.Name.trim() ? category.Name.trim() : key;
    const summary: ThemeSummary = { key, name, type, isNew: category.IsNew === true };
    if (type === 'ThemePack') themePacks.push(summary);
    else regular.push(summary);
  }

  return [...regular, ...themePacks];
}

/** Immagini grezze → `WallpaperImage[]` (gli `urlbase` malformati vengono scartati). */
export function mapThemeImages(raw: BingImagesResponse, ctx: ThemeImageContext): WallpaperImage[] {
  const source = Array.isArray(raw?.images) ? raw.images : [];
  const images: WallpaperImage[] = [];

  for (const item of source) {
    if (item == null) continue;
    const id = extractImageId(item.urlbase);
    if (!id) {
      ctx.logger?.warn(
        `Immagine scartata: urlbase malformato nel tema "${ctx.themeKey}" (${String(item.urlbase ?? 'assente')})`,
      );
      continue;
    }
    // L'indice è la posizione nella lista servita: resta coerente con /api/image?i=...
    images.push(mapImage(item, id, images.length, ctx));
  }

  return images;
}

/**
 * Estrae l'id Bing da `urlbase` (`https://www.bing.com/th?id=OBGA.Xyz` → `OBGA.Xyz`).
 * Ritorna `null` se il valore è assente o non contiene un parametro `id=`.
 */
export function extractImageId(urlbase: string | null | undefined): string | null {
  if (typeof urlbase !== 'string') return null;
  const value = urlbase.trim();
  if (!value) return null;
  const match = ID_QUERY_PATTERN.exec(value);
  const rawId = match?.[1];
  if (!rawId) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawId);
  } catch {
    decoded = rawId;
  }
  const id = decoded.trim();
  return id.length > 0 ? id : null;
}

function mapImage(item: BingImage, id: string, index: number, ctx: ThemeImageContext): WallpaperImage {
  const urls = buildImageUrls(ctx.market, ctx.themeKey, index, id);
  return {
    index,
    id,
    title: text(item.title) || text(item.headline),
    description: text(item.description),
    headline: text(item.headline),
    copyright: text(item.copyrighttext),
    copyrightUrl: trimOrNull(item.copyrightlink),
    searchUrl: firstNonEmpty(item.topRightCTAData?.SearchUrls) ?? trimOrNull(item.copyrightlink),
    startDate: text(item.startdate),
    themes: Array.isArray(item.theme)
      ? item.theme.filter((theme): theme is string => typeof theme === 'string' && theme.length > 0)
      : [],
    sourceType: text(item.sourceType),
    animated: mapAnimated(item, urls),
    urls,
    downloadBase: `/api/download?mkt=${encodeURIComponent(ctx.market)}&theme=${encodeURIComponent(
      ctx.themeKey,
    )}&i=${index}`,
  };
}

function buildImageUrls(market: string, themeKey: string, index: number, id: string): WallpaperImageUrls {
  // `v` = id immagine: cache-buster. L'URL `/api/image?i=N` è una posizione logica che
  // cambia ogni giorno; i browser possono avere in cache un VECCHIO redirect 302 con
  // `immutable` (emesso prima del fix delle cache) valido fino a 30 giorni. Cambiando
  // la query quando cambia l'immagine, quella entry stantia non viene mai più usata.
  // Il parametro è ignorato dalla route (zod scarta le chiavi sconosciute).
  const base =
    `/api/image?mkt=${encodeURIComponent(market)}&theme=${encodeURIComponent(themeKey)}&i=${index}` +
    `&v=${encodeURIComponent(id)}`;
  return {
    thumb: `${base}&w=${SIZES.thumb.width}&h=${SIZES.thumb.height}`,
    card: `${base}&w=${SIZES.card.width}&h=${SIZES.card.height}`,
    preview: `${base}&w=${SIZES.preview.width}&h=${SIZES.preview.height}`,
    full: `${base}&w=${SIZES.full.width}&h=${SIZES.full.height}`,
    original: base,
  };
}

/**
 * Temi animati: `AnimatedWP` è presente solo per le immagini animate.
 * Il poster è l'immagine `full` (serve una JPEG, non il video); il video è il primo
 * asset con estensione video (fallback: primo asset). Se non c'è un asset video
 * utilizzabile, `animated` resta `null` (l'immagine è comunque utilizzabile come statica).
 */
function mapAnimated(item: BingImage, urls: WallpaperImageUrls): WallpaperImage['animated'] {
  const animatedWp = item.AnimatedWP;
  if (animatedWp == null) return null;
  const assets = Array.isArray(animatedWp.Assets) ? animatedWp.Assets : [];
  const videoUrl = findVideoUrl(assets);
  if (!videoUrl) return null;
  return { name: text(animatedWp.Name), posterUrl: urls.full, videoUrl };
}

function findVideoUrl(assets: readonly BingAnimatedAsset[]): string | null {
  // 1) asset con estensione video; 2) fallback su Assets[0] (come da payload reale Bing),
  // ma mai su un asset HTML/CSS che non sarebbe riproducibile come video.
  const video = assets.find((asset) => candidateOf(asset).includes('.mp4') || VIDEO_EXTENSION.test(candidateOf(asset)));
  if (video) return trimOrNull(video.Url);
  const first = assets[0];
  if (first && !HTML_ASSET.test(candidateOf(first))) return trimOrNull(first.Url);
  return null;
}

function candidateOf(asset: BingAnimatedAsset | undefined): string {
  return `${text(asset?.FileName)} ${text(asset?.Url)}`.toLowerCase();
}

function normalizeThemeType(type: string | null | undefined): ThemeType {
  return typeof type === 'string' && type.toLowerCase() === 'themepack' ? 'ThemePack' : 'Regular';
}

function text(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

function trimOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstNonEmpty(values: readonly (string | null | undefined)[] | null | undefined): string | null {
  if (!Array.isArray(values)) return null;
  for (const value of values) {
    const trimmed = trimOrNull(value);
    if (trimmed) return trimmed;
  }
  return null;
}
