import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findResolution, MAX_QUALITY, MIN_QUALITY } from '../domain/resolutions';
import { badRequest, parseOrBadRequest } from '../errors';
import { buildCdnUrl, buildDownloadFilename, DOWNLOAD_TIMEOUT_MS, sendCdnStream } from './media';
import { marketSchema } from './queries';
import type { RouteDeps } from './types';

export const downloadQuerySchema = z.object({
  theme: z.string().min(1, 'tema obbligatorio'),
  i: z.coerce.number().int().min(0, 'indice 0-based obbligatorio'),
  res: z.string().min(1, 'risoluzione obbligatoria'),
  mkt: marketSchema.optional(),
  qlt: z.coerce
    .number()
    .int()
    .min(MIN_QUALITY, `minimo ${MIN_QUALITY}`)
    .max(MAX_QUALITY, `massimo ${MAX_QUALITY}`)
    .optional(),
});

/**
 * `GET /api/download` — stream del file con nome sensato, `Range` inoltrato.
 * Nessun buffering: i byte vanno dal CDN al client in streaming.
 */
export function registerDownloadRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get('/download', async (request, reply) => {
    const query = parseOrBadRequest(downloadQuerySchema, request.query, 'query');
    const market = query.mkt ?? deps.config.defaultMarket;

    const resolution = findResolution(query.res);
    if (!resolution) throw badRequest(`Risoluzione "${query.res}" non supportata`);

    const entry = await deps.gallery.getImageEntry(market, query.theme, query.i);
    const url = buildCdnUrl(deps.config.bingCdnBase, entry.image.id, {
      width: resolution.width > 0 ? resolution.width : undefined,
      height: resolution.height > 0 ? resolution.height : undefined,
      quality: query.qlt,
    });

    const filename = buildDownloadFilename({
      theme: entry.theme.key,
      title: entry.image.title,
      id: entry.image.id,
      res: query.res,
    });
    const range = typeof request.headers.range === 'string' ? request.headers.range : undefined;

    return sendCdnStream(reply, {
      fetchImpl: deps.fetchImpl,
      timeoutMs: Math.max(deps.config.upstreamTimeoutMs, DOWNLOAD_TIMEOUT_MS),
      url,
      context: `download ${entry.image.id}`,
      filename,
      range,
    });
  });
}
