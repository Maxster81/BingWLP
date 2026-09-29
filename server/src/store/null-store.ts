import type { ImageDescriptor, ImageMeta, ImageStore } from './types';

/**
 * Store attivo di default: nessuna persistenza, nessun I/O.
 * `/api/image` fa redirect al CDN, `/api/download` streamma dal CDN.
 */
export class NullImageStore implements ImageStore {
  readonly kind = 'null' as const;

  isEnabled(): boolean {
    return false;
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
    // no-op intenzionale
  }
}
