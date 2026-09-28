import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  MAX_DIMENSION,
  MAX_QUALITY,
  MIN_DIMENSION,
  MIN_QUALITY,
} from '../domain/resolutions';
import { parseOrBadRequest } from '../errors';
import { buildCdnUrl, buildDownloadFilename, describeSize, sendCdnStream, STREAM_CACHE_CONTROL } from './media';
import { marketSchema, refreshSchema } from './queries';
import type { RouteDeps } from './types';

const dimensionSchema = z.coerce
  .number()
  .int()
  .min(MIN_DIMENSION, `minimo ${MIN_DIMENSION}px`)
  .max(MAX_DIMENSION, `massimo ${MAX_DIMENSION}px`);

const qualitySchema = z.coerce
  .number()
  .int()
  .min(MIN_QUALITY, `minimo ${MIN_QUALITY}`)
  .max(MAX_QUALITY, `massimo ${MAX_QUALITY}`);

export const imageQuerySchema = z.object({
  theme: z.string().min(1, 'tema obbligatorio'),
  i: z.coerce.number().int().min(0, 'indice 0-based obbligatorio'),
  mkt: marketSchema.optional(),
  w: dimensionSchema.optional(),
  h: dimensionSchema.optional(),
  qlt: qualitySchema.optional(),
  mode: z.enum(['redirect', 'stream']).optional(),
  dl: refreshSchema.optional(),
});

/**
 * `GET /api/image` — redirect al CDN (default) o proxy streaming dei byte.
 *
 * Il redirect è deliberato: nessuna banda sul server per griglia/carosello e, in
 * futuro, uno store locale potrà servire i byte locali senza cambiare gli URL client
 * (vedi `store/types.ts`).
 */
export function registerImageRoutes(app: FastifyInstance, deps: RouteDeps): void {
  app.get('/image', async (request, reply) => {
    const query = parseOrBadRequest(imageQuerySchema, request.query, 'query');
    const market = query.mkt ?? deps.config.defaultMarket;
    const entry = await deps.gallery.getImageEntry(market, query.theme, query.i);

    const location = buildCdnUrl(deps.config.bingCdnBase, entry.image.id, {
      width: query.w,
      height: query.h,
      // `qlt` incluso solo se richiesto: altrimenti il CDN usa la sua qualità di default.
      quality: query.qlt,
    });

    const download = query.dl === true;
    if (query.mode !== 'stream' && !download) {
      return reply
        .header('cache-control', STREAM_CACHE_CONTROL)
        .header('location', location)
        .code(302)
        .send();
    }

    // `dl=1` richiede per forza i byte (un 302 non può portare il filename).
    return sendCdnStream(reply, {
      fetchImpl: deps.fetchImpl,
      timeoutMs: deps.config.upstreamTimeoutMs,
      url: location,
      context: `immagine ${entry.image.id}`,
      filename: download
        ? buildDownloadFilename({
            theme: entry.theme.key,
            title: entry.image.title,
            id: entry.image.id,
            res: describeSize(query.w, query.h),
          })
        : undefined,
    });
  });
}
