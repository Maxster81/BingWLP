/**
 * Tipi del contratto pubblico (docs/API.md, "frozen v1").
 * Ogni campo qui dentro è ciò che il frontend consuma: non rinominarli.
 */

export type MarketCode = string; // es. "it-IT"  ^[a-z]{2}-[A-Z]{2}$
export type ThemeKey = string; // es. "travel", "wild animal" (case-sensitive!)
export type ThemeType = 'Regular' | 'ThemePack';

/** Sottoinsieme di `Theme` che arriva dalle categorie Bing (senza conteggi/cover). */
export type ThemeSummary = {
  key: ThemeKey;
  name: string;
  type: ThemeType;
  isNew: boolean;
};

/** Tema arricchito con conteggio immagini e cover (endpoint /api/themes). */
export type Theme = ThemeSummary & {
  imageCount: number | null; // null se upstream non raggiungibile in quel momento
  coverUrl: string | null; // URL relativo /api/image?... (800x450) oppure null
};

/** Forma "animated" dei temi animati (poster + mp4 Microsoft). */
export type AnimatedWallpaper = {
  name: string;
  posterUrl: string;
  videoUrl: string;
};

/** URL relativi pronti all'uso (proxy/redirect del backend). */
export type WallpaperImageUrls = {
  thumb: string; // 480x270
  card: string; // 800x450
  preview: string; // 1280x720
  full: string; // 1920x1080
  original: string; // dimensione nativa
};

export type WallpaperImage = {
  index: number; // 0-based, indice stabile nell'ordine upstream (dopo lo scarto dei malformati)
  id: string; // id immagine Bing
  title: string;
  description: string;
  headline: string;
  copyright: string;
  copyrightUrl: string | null;
  searchUrl: string | null;
  startDate: string;
  themes: string[];
  sourceType: string;
  animated: AnimatedWallpaper | null;
  urls: WallpaperImageUrls;
  downloadBase: string; // /api/download?mkt=..&theme=..&i=<index>
};

export type ResolutionGroup = 'original' | 'desktop' | 'ultrawide' | 'mobile' | 'tablet';

export type Resolution = {
  key: string; // "1920x1080" | "original"
  label: string; // etichetta IT pronta da mostrare
  group: ResolutionGroup;
  width: number; // 0 = nativa
  height: number; // 0 = nativa
  aspect: string; // "16:9" | "19.5:9" | "nativa" | ...
  recommended?: boolean;
};

export type Market = {
  code: MarketCode;
  name: string;
  flag: string;
};

/** Esito recente delle chiamate verso Bing (vedi /api/health). */
export type UpstreamStatus = 'ok' | 'degraded' | 'down';

export type CacheStats = {
  themes: number;
  images: number;
  entries: number;
};
