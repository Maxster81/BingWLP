import type { AppConfig } from '../config';
import type { LoggerLike } from '../logger';
import { FsImageStore } from './fs-store';
import { NullImageStore } from './null-store';
import type { ImageStore } from './types';

export type { ImageDescriptor, ImageMeta, ImageStore } from './types';
export { NullImageStore } from './null-store';
export { FsImageStore } from './fs-store';

/** Messaggio di avviso richiesto quando `IMAGE_STORE=fs` (non implementato). */
export const FS_STORE_WARNING =
  'IMAGE_STORE=fs non implementato in questa versione, uso NullImageStore';

/**
 * Costruisce lo store attivo. Con `IMAGE_STORE=fs` la creazione fallisce (scheletro)
 * e si ricade su `NullImageStore`, loggando l'avviso.
 */
export function createImageStore(config: AppConfig, logger?: LoggerLike): ImageStore {
  if (config.imageStore !== 'fs') return new NullImageStore();
  try {
    return new FsImageStore(config.imageStoreDir);
  } catch {
    logger?.warn(FS_STORE_WARNING);
    return new NullImageStore();
  }
}
