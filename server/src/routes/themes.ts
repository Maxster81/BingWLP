import type { FastifyInstance } from 'fastify';
import { parseListQuery } from './queries';
import type { RouteDeps } from './types';

/** `GET /api/themes` e `GET /api/themes/:key/images`. */
/** Le liste ruotano ogni giorno: il browser non deve cacharle (ci pensa il server). */
const LIST_CACHE_CONTROL = 'no-store';

export function registerThemeRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get('/themes', async (request, reply) => {
    const { market, refresh, includeImages } = parseListQuery(
      request.query,
      deps.config.defaultMarket,
    );
    void reply.header('cache-control', LIST_CACHE_CONTROL);
    return deps.gallery.getThemes(market, { refresh, includeImages });
  });

  app.get<{ Params: { key: string } }>('/themes/:key/images', async (request, reply) => {
    const { market, refresh } = parseListQuery(request.query, deps.config.defaultMarket);
    void reply.header('cache-control', LIST_CACHE_CONTROL);
    // `request.params.key` arriva già percent-decoded da Fastify: le key con spazi
    // ("wild animal") e il case-sensitive vanno confrontate così come sono.
    return deps.gallery.getThemeImages(market, request.params.key, { refresh });
  });
}
