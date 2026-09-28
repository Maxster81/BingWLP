import type { ImageDescriptor, ImageMeta, ImageStore } from './types';

/**
 * Scheletro NON attivo dello store su filesystem (`IMAGE_STORE=fs`).
 *
 * In questa iterazione nessuno store su disco è implementato: il costruttore lancia
 * e `createImageStore` ricade su `NullImageStore` loggando un avviso.
 *
 * TODO futuro "storico immagini" (non richiesto ora):
 * - layout su disco proposto: `<IMAGE_STORE_DIR>/<mkt>/<theme-slug>/<image-id>/<res>.jpg`
 *   (l'id Bing è univoco e contiene già l'immagine, `res` distingue 1920x1080 / original / ...);
 * - `locate` → `existsSync` + ritorno del path pubblico servibile da @fastify/static
 *   (es. `/media/...`), così `/api/image` può servire i byte locali senza cambiare gli URL client;
 * - `persist` → scrittura atomica (tmp + rename) e best-effort: non deve mai far fallire la risposta;
 * - quota/eviction basata su `CACHE_IMAGE_BYTES` (env già presente) e sweep periodico tipo TtlCache;
 * - metadati (`ImageMeta`, titolo, copyright) accanto all'immagine per ricostruire la galleria offline.
 */
export class FsImageStore implements ImageStore {
  readonly kind = 'fs' as const;

  constructor(_rootDir: string) {
    throw new Error(
      'FsImageStore non implementato: disponibile in una versione futura (storico immagini). Nessun file scritto.',
    );
  }

  isEnabled(): boolean {
    return true;
  }

  async locate(_descriptor: ImageDescriptor, _res: string): Promise<string | null> {
    return null;
  }

  async persist(
    _descriptor: ImageDescriptor,
    _res: string,
    _bytes: Buffer,
    _meta: ImageMeta,
  ): Promise<void> {
    // mai raggiunto: il costruttore lancia
  }
}
