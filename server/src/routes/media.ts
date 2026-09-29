import { Readable } from 'node:stream';
import type { FastifyReply } from 'fastify';
import { upstreamError, upstreamTimeout, upstreamUnavailable } from '../errors';
import { slugify } from '../lib/slug';

/** Cache-Control per immagini/redirect (30 giorni, immutable). */
export const STREAM_CACHE_CONTROL = 'public, max-age=2592000, immutable';
export const DEFAULT_IMAGE_CONTENT_TYPE = 'image/jpeg';
/**
 * Timeout per gli stream dal CDN: più generoso di quello delle API JSON perché
 * riguarda il trasferimento di un file, non una chiamata di metadata.
 */
export const DOWNLOAD_TIMEOUT_MS = 30_000;

export type CdnQuery = {
  width?: number | undefined;
  height?: number | undefined;
  quality?: number | undefined;
};

/**
 * `BING_CDN_BASE?id=<id>` + `w`/`h`/`qlt` solo se richiesti
 * (senza `w`/`h` il CDN restituisce la dimensione nativa).
 */
export function buildCdnUrl(cdnBase: string, id: string, query: CdnQuery = {}): string {
  const params = new URLSearchParams({ id });
  if (query.width !== undefined) params.set('w', String(query.width));
  if (query.height !== undefined) params.set('h', String(query.height));
  if (query.quality !== undefined) params.set('qlt', String(query.quality));
  return `${cdnBase}?${params.toString()}`;
}

export type FetchCdnOptions = {
  fetchImpl: typeof fetch;
  timeoutMs: number;
  range?: string | undefined;
  context: string;
};

/** GET verso il CDN immagini con timeout; mappa gli errori di rete nei codici del contratto. */
export async function fetchCdn(url: string, options: FetchCdnOptions): Promise<Response> {
  try {
    return await options.fetchImpl(url, {
      headers: options.range ? { range: options.range } : {},
      signal: AbortSignal.timeout(options.timeoutMs),
    });
  } catch (error) {
    if (isAbortLike(error)) {
      throw upstreamTimeout(`Timeout di ${options.timeoutMs}ms dal CDN Bing (${options.context})`, {
        cause: error,
      });
    }
    throw upstreamUnavailable(`CDN Bing non raggiungibile (${options.context})`, error);
  }
}

export type SendCdnStreamOptions = {
  fetchImpl: typeof fetch;
  timeoutMs: number;
  url: string;
  context: string;
  /** Se presente imposta `Content-Disposition: attachment`. */
  filename?: string | undefined;
  range?: string | undefined;
  contentTypeFallback?: string;
};

/**
 * Proxy streaming dei byte dal CDN: nessun buffering in memoria
 * (`Readable.fromWeb` + `reply.send`). Inoltra `Range` e i relativi header di risposta.
 */
export async function sendCdnStream(
  reply: FastifyReply,
  options: SendCdnStreamOptions,
): Promise<FastifyReply> {
  const response = await fetchCdn(options.url, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
    range: options.range,
    context: options.context,
  });

  if (!response.ok && response.status !== 206) {
    throw upstreamError(`CDN Bing ha risposto ${response.status} (${options.context})`);
  }

  const contentType =
    response.headers.get('content-type') ?? options.contentTypeFallback ?? DEFAULT_IMAGE_CONTENT_TYPE;
  reply.header('cache-control', STREAM_CACHE_CONTROL).header('content-type', contentType);

  const contentLength = response.headers.get('content-length');
  if (contentLength) reply.header('content-length', contentLength);
  const acceptRanges = response.headers.get('accept-ranges');
  if (acceptRanges) reply.header('accept-ranges', acceptRanges);
  const contentRange = response.headers.get('content-range');
  if (contentRange) reply.header('content-range', contentRange);
  if (options.filename) reply.header('content-disposition', `attachment; filename="${options.filename}"`);

  reply.code(response.status === 206 ? 206 : 200);
  return reply.send(toNodeReadable(response.body));
}

/** `bing-wallpaper_<theme-slug>_<title-slug>_<res>.jpg` (slug ASCII, max 60 char ciascuno). */
export function buildDownloadFilename(parts: {
  theme: string;
  title: string;
  id: string;
  res: string;
}): string {
  const themeSlug = slugify(parts.theme) || 'tema';
  const titleSlug = slugify(parts.title) || slugify(parts.id) || 'wallpaper';
  const resSlug = slugify(parts.res) || 'original';
  return `bing-wallpaper_${themeSlug}_${titleSlug}_${resSlug}.jpg`;
}

/** `1920x1080` per il nome file quando l'utente chiede dimensioni esplicite. */
export function describeSize(width?: number, height?: number): string {
  if (width && height) return `${width}x${height}`;
  if (width) return `${width}w`;
  if (height) return `${height}h`;
  return 'original';
}

function toNodeReadable(body: ReadableStream<Uint8Array> | null): Readable {
  if (!body) throw upstreamError('Il CDN Bing non ha restituito alcun corpo');
  return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
}

function isAbortLike(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError' || error.name === 'TimeoutError';
}
