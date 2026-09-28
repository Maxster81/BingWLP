import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import packageJson from '../package.json';
import type { BingClient } from './bing/client';
import type { AppConfig } from './config';
import { isAppError, notFound, rateLimited } from './errors';
import { createLoggerOptions, type LoggerLike } from './logger';
import { registerApiRoutes } from './routes';
import { Gallery } from './services/gallery';
import type { ImageStore } from './store';

export type BuildAppDeps = {
  config: AppConfig;
  bingClient: BingClient;
  store: ImageStore;
  /** Opzioni logger Fastify (default: pino da config). Nei test si passa `false`. */
  logger?: FastifyServerOptions['logger'];
  /** Fetch usato per il proxy dal CDN (iniettabile nei test). */
  fetchImpl?: typeof fetch;
  /** Override della versione riportata da /api/health. */
  version?: string;
  startedAt?: number;
};

const DEFAULT_VERSION = typeof packageJson.version === 'string' ? packageJson.version : '1.0.0';

/**
 * Costruisce l'app Fastify con dipendenze iniettate (testabile con `fastify.inject()`).
 */
export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    logger: deps.logger ?? createLoggerOptions(config),
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
    trustProxy: true,
  });

  // `app.log` (pino) soddisfa `LoggerLike`: lo passiamo ai moduli non-Fastify.
  const logger: LoggerLike = app.log;
  const gallery = new Gallery({ config, bing: deps.bingClient, logger });
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (isAppError(error)) {
      if (error.statusCode >= 500) request.log.error({ err: error }, 'errore applicativo');
      return reply.code(error.statusCode).send(error.toJSON());
    }

    const statusCode =
      typeof error.statusCode === 'number' && error.statusCode >= 400 ? error.statusCode : 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'richiesta fallita');
      return reply
        .code(statusCode)
        .send({ error: { code: 'INTERNAL_ERROR', message: 'Errore interno del server' } });
    }
    // Errori di parsing/validazione di Fastify → forma di errore del contratto.
    return reply.code(statusCode).send({ error: { code: 'BAD_REQUEST', message: error.message } });
  });

  if (config.rateLimitMax > 0) {
    await app.register(rateLimit, {
      max: config.rateLimitMax,
      timeWindow: '1 minute',
      errorResponseBuilder: () => rateLimited().toJSON(),
    });
  }

  if (config.allowOrigins.length > 0) {
    await app.register(cors, {
      origin: config.allowOrigins,
      methods: ['GET', 'HEAD', 'OPTIONS'],
    });
  }

  await app.register(
    async (api) => {
      registerApiRoutes(api, {
        config,
        gallery,
        bing: deps.bingClient,
        store: deps.store,
        fetchImpl,
        startedAt: deps.startedAt ?? Date.now(),
        version: deps.version ?? DEFAULT_VERSION,
      });
    },
    { prefix: '/api' },
  );

  let staticDir: string | undefined;
  if (config.serveStatic) {
    staticDir = resolveStaticDir(config.staticDir);
    if (staticDir) {
      await app.register(fastifyStatic, { root: staticDir, prefix: '/', index: ['index.html'] });
    } else {
      logger.warn(
        `SERVE_STATIC attivo ma la cartella statica "${config.staticDir}" non esiste: statico non servito`,
      );
    }
  }

  app.setNotFoundHandler((request, reply) => {
    // SPA fallback: le GET non-/api senza file corrispondente servono index.html.
    // Le rotte /api/* restano JSON, anche quando non esistono.
    const isApiRequest = request.url === '/api' || request.url.startsWith('/api/');
    if (staticDir && !isApiRequest && request.method === 'GET') {
      return reply.sendFile('index.html');
    }
    const error = notFound(`Rotta non trovata: ${request.method} ${request.url}`);
    return reply.code(error.statusCode).send(error.toJSON());
  });

  return app;
}

/**
 * Risolve la cartella del build frontend: path assoluto, relativo alla cwd (dev in
 * `server/`) oppure relativo alla root del pacchetto server (prod: `node server/dist/index.js`).
 */
export function resolveStaticDir(staticDir: string): string | undefined {
  const packageRoot = fileURLToPath(new URL('../', import.meta.url));
  const candidates = isAbsolute(staticDir)
    ? [staticDir]
    : [resolve(process.cwd(), staticDir), resolve(packageRoot, staticDir), resolve(packageRoot, '../web/dist')];
  return candidates.find((candidate) => existsSync(candidate));
}
