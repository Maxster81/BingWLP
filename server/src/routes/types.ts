import type { BingClient } from '../bing/client';
import type { AppConfig } from '../config';
import type { Gallery } from '../services/gallery';
import type { ImageStore } from '../store';

/** Dipendenze condivise dalle rotte /api/*. */
export type RouteDeps = {
  config: AppConfig;
  gallery: Gallery;
  bing: BingClient;
  store: ImageStore;
  /** Iniettabile nei test: il fetch usato per il proxy/stream dal CDN Bing. */
  fetchImpl: typeof fetch;
  /** Epoch ms di avvio del processo (per uptimeSec in /api/health). */
  startedAt: number;
  version: string;
};
