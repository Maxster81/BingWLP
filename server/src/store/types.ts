import type { MarketCode, ThemeKey } from '../domain/types';

/**
 * Descrittore di un'immagine del catalogo: identifica in modo stabile il wallpaper
 * (market + tema + indice upstream) a prescindere dalla risoluzione richiesta.
 */
export type ImageDescriptor = {
  id: string;
  themeKey: ThemeKey;
  market: MarketCode;
  /** Indice 0-based nell'ordine upstream della lista del tema. */
  index: number;
  title: string;
};

export type ImageMeta = {
  contentType?: string;
  width?: number;
  height?: number;
  /** ISO string del momento in cui i byte sono stati recuperati dal CDN. */
  fetchedAt?: string;
};

/**
 * Contratto di archiviazione delle immagini (previsto, non implementato in questa
 * iterazione: vedi docs/API.md → "Archiviazione delle immagini").
 *
 * Nota: progettato come punto di estensione per un futuro "storico immagini"
 * (le immagini del giorno cambiano e Bing non le conserva all'infinito).
 * Oggi l'unica implementazione attiva è `NullImageStore` (no-op): `/api/image`
 * fa redirect al CDN e `/api/download` streamma dal CDN.
 */
export interface ImageStore {
  readonly kind: 'null' | 'fs';
  isEnabled(): boolean;
  /** Ritorna il path pubblico locale di un'immagine se archiviata, altrimenti null. */
  locate(descriptor: ImageDescriptor, res: string): Promise<string | null>;
  /** Archivia i byte (best-effort). */
  persist(descriptor: ImageDescriptor, res: string, bytes: Buffer, meta: ImageMeta): Promise<void>;
}
