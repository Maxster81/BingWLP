import type { FastifyInstance } from 'fastify';
import { DEFAULT_RESOLUTION_KEY, RESOLUTIONS } from '../domain/resolutions';

/** `GET /api/resolutions` — preset disponibili + default. */
export function registerResolutionRoutes(app: FastifyInstance): void {
  app.get('/resolutions', async (_request, reply) => {
    void reply.header('cache-control', 'public, max-age=3600');
    return {
      default: DEFAULT_RESOLUTION_KEY,
      resolutions: RESOLUTIONS,
    };
  });
}
