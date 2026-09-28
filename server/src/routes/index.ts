import type { FastifyInstance } from 'fastify';
import { registerConfigRoutes } from './config';
import { registerDownloadRoutes } from './download';
import { registerHealthRoutes } from './health';
import { registerImageRoutes } from './images';
import { registerResolutionRoutes } from './resolutions';
import { registerThemeRoutes } from './themes';
import type { RouteDeps } from './types';

/** Registra tutte le rotte sotto il prefisso `/api`. */
export function registerApiRoutes(app: FastifyInstance, deps: RouteDeps): void {
  registerHealthRoutes(app, deps);
  registerConfigRoutes(app, deps);
  registerResolutionRoutes(app);
  registerThemeRoutes(app, deps);
  registerImageRoutes(app, deps);
  registerDownloadRoutes(app, deps);
}

export type { RouteDeps } from './types';
