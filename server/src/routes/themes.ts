import type { FastifyInstance } from 'fastify';
import { parseListQuery } from './queries';
import type { RouteDeps } from './types';

/** `GET /api/themes` e `GET /api/themes/:key/images`. */
export function registerThemeRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get('/themes', async (request) => {
    const { market, refresh, includeImages } = parseListQuery(
      request.query,
      deps.config.defaultMarket,
    );
    return deps.gallery.getThemes(market, { refresh, includeImages });
  });

  app.get<{ Params: { key: string } }>('/themes/:key/images', async (request) => {
    const { market, refresh } = parseListQuery(request.query, deps.config.defaultMarket);
    // `request.params.key` arriva già percent-decoded da Fastify: le key con spazi
    // ("wild animal") e il case-sensitive vanno confrontate così come sono.
    return deps.gallery.getThemeImages(market, request.params.key, { refresh });
  });
}
