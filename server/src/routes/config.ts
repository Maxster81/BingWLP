import type { FastifyInstance } from 'fastify';
import { getMarkets } from '../domain/markets';
import {
  DEFAULT_RESOLUTION_KEY,
  MAX_DIMENSION,
  RESOLUTIONS,
} from '../domain/resolutions';
import type { RouteDeps } from './types';

/** `GET /api/config` — configurazione statica per il frontend (una chiamata all'avvio). */
export function registerConfigRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { config } = deps;

  app.get('/config', async (_request, reply) => {
    // Dati statici fino al prossimo deploy: cache breve esplicita, niente euristica browser.
    void reply.header('cache-control', 'public, max-age=3600');
    return {
    defaultMarket: config.defaultMarket,
    markets: getMarkets(config.defaultMarket),
    resolutions: RESOLUTIONS,
    defaultResolution: DEFAULT_RESOLUTION_KEY,
    limits: { maxWidth: MAX_DIMENSION, maxHeight: MAX_DIMENSION },
    cacheTtlSec: { themes: config.cacheTtlThemesSec, images: config.cacheTtlImagesSec },
    };
  });
}
