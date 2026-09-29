import type { FastifyInstance } from 'fastify';
import { DEFAULT_RESOLUTION_KEY, RESOLUTIONS } from '../domain/resolutions';

/** `GET /api/resolutions` — preset disponibili + default. */
export function registerResolutionRoutes(app: FastifyInstance): void {
  app.get('/resolutions', async () => ({
    default: DEFAULT_RESOLUTION_KEY,
    resolutions: RESOLUTIONS,
  }));
}
