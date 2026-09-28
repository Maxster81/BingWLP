import type { FastifyInstance } from 'fastify';
import type { RouteDeps } from './types';

/** `GET /api/health` — liveness + esito recente verso Bing + statistiche cache. */
export function registerHealthRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get('/health', async () => {
    const upstream = deps.bing.getUpstreamStatus();
    return {
      // `degraded` quando Bing non risponde più su nessun giro recente (il processo è vivo).
      status: upstream === 'down' ? 'degraded' : 'ok',
      version: deps.version,
      uptimeSec: Math.round((Date.now() - deps.startedAt) / 1000),
      upstream,
      cache: deps.gallery.cacheStats(),
      timestamp: new Date().toISOString(),
    };
  });
}
