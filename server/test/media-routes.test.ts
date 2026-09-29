import { describe, expect, it } from 'vitest';
import { buildTestApp, failingFetch, FakeBingClient, travelImagesResponse } from './fixtures';

const TRAVEL_ID = 'OBGA.Lock2017-B5_AF_DrakensbergGoldenGateNP_shutterstock_538817752';
const TRAVEL_SLUG = 'golden-gate-highlands-national-park-south-africa';
const CDN_BASE = 'https://www.bing.com/th';

/** Fetch finto che registra URL e init (per verificare Location/Range/query al CDN). */
function capturingFetch(options: { status?: number; headers?: Record<string, string> } = {}): {
  impl: typeof fetch;
  calls: string[];
  inits: RequestInit[];
} {
  const calls: string[] = [];
  const inits: RequestInit[] = [];
  const impl: typeof fetch = async (input, init) => {
    calls.push(String(input));
    inits.push(init ?? {});
    return new Response('fake-jpeg-bytes', {
      status: options.status ?? 200,
      headers: { 'content-type': 'image/jpeg', ...(options.headers ?? {}) },
    });
  };
  return { impl, calls, inits };
}

describe('GET /api/image', () => {
  it('302 verso il CDN con w/h e Cache-Control immutable', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const res = await app.inject({ url: '/api/image?theme=travel&i=0&w=800&h=450' });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${CDN_BASE}?id=${TRAVEL_ID}&w=800&h=450`);
    expect(res.headers['cache-control']).toBe('public, max-age=2592000, immutable');
    await app.close();
  });

  it('omette w/h/qlt se non passati e include solo qlt quando richiesto', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const plain = await app.inject({ url: '/api/image?theme=travel&i=0' });
    expect(plain.headers.location).toBe(`${CDN_BASE}?id=${TRAVEL_ID}`);

    const withQuality = await app.inject({ url: '/api/image?theme=travel&i=0&qlt=95' });
    expect(withQuality.headers.location).toBe(`${CDN_BASE}?id=${TRAVEL_ID}&qlt=95`);
    await app.close();
  });

  it('400 BAD_REQUEST sui parametri non validi', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const invalid = [
      '/api/image?i=0',
      '/api/image?theme=travel',
      '/api/image?theme=travel&i=0&w=15',
      '/api/image?theme=travel&i=0&h=8001',
      '/api/image?theme=travel&i=0&qlt=0',
      '/api/image?theme=travel&i=0&qlt=101',
      '/api/image?theme=travel&i=-1',
      '/api/image?theme=travel&i=abc',
      '/api/image?theme=travel&i=0&mode=foo',
      '/api/image?theme=travel&i=0&mkt=italiano',
    ];
    for (const url of invalid) {
      const res = await app.inject({ url });
      expect(res.statusCode, url).toBe(400);
      expect(res.json(), url).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    }
    await app.close();
  });

  it('404 IMAGE_NOT_FOUND per indice fuori range e THEME_NOT_FOUND per tema sconosciuto', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const outOfRange = await app.inject({ url: '/api/image?theme=travel&i=99' });
    expect(outOfRange.statusCode).toBe(404);
    expect(outOfRange.json()).toMatchObject({ error: { code: 'IMAGE_NOT_FOUND' } });

    const missingTheme = await app.inject({ url: '/api/image?theme=ghost&i=0' });
    expect(missingTheme.statusCode).toBe(404);
    expect(missingTheme.json()).toMatchObject({ error: { code: 'THEME_NOT_FOUND' } });
    await app.close();
  });

  it('mode=stream fa da proxy e restituisce i byte del CDN', async () => {
    const { impl, calls } = capturingFetch();
    const app = await buildTestApp(new FakeBingClient(), { fetchImpl: impl });
    const res = await app.inject({ url: '/api/image?theme=travel&i=0&w=800&h=450&mode=stream' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['cache-control']).toBe('public, max-age=2592000, immutable');
    expect(res.body).toBe('fake-jpeg-bytes');
    expect(calls[0]).toBe(`${CDN_BASE}?id=${TRAVEL_ID}&w=800&h=450`);
    await app.close();
  });

  it('dl=1 forza il download anche in modalità redirect', async () => {
    const { impl } = capturingFetch();
    const app = await buildTestApp(new FakeBingClient(), { fetchImpl: impl });
    const res = await app.inject({ url: '/api/image?theme=travel&i=0&w=800&h=450&dl=1' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="bing-wallpaper_travel_${TRAVEL_SLUG}_800x450.jpg"`,
    );
    await app.close();
  });

  it('non chiama il CDN quando fa redirect', async () => {
    // `failingFetch` è il default di buildTestApp: se il CDN venisse contattato, la richiesta fallirebbe.
    const app = await buildTestApp(new FakeBingClient(), { fetchImpl: failingFetch });
    const res = await app.inject({ url: '/api/image?theme=travel&i=0' });
    expect(res.statusCode).toBe(302);
    await app.close();
  });

  it('mappa gli errori del CDN: 500 → 502, rete KO → 503', async () => {
    const errorApp = await buildTestApp(new FakeBingClient(), {
      fetchImpl: capturingFetch({ status: 500 }).impl,
    });
    const error = await errorApp.inject({ url: '/api/image?theme=travel&i=0&mode=stream' });
    expect(error.statusCode).toBe(502);
    expect(error.json()).toMatchObject({ error: { code: 'UPSTREAM_ERROR' } });
    await errorApp.close();

    const downApp = await buildTestApp(new FakeBingClient(), {
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const down = await downApp.inject({ url: '/api/image?theme=travel&i=0&mode=stream' });
    expect(down.statusCode).toBe(503);
    expect(down.json()).toMatchObject({ error: { code: 'UPSTREAM_UNAVAILABLE' } });
    await downApp.close();
  });
});

describe('GET /api/download', () => {
  it('streamma il file con nome sensato e risoluzione richiesta', async () => {
    const { impl, calls } = capturingFetch();
    const app = await buildTestApp(new FakeBingClient(), { fetchImpl: impl });
    const res = await app.inject({ url: '/api/download?theme=travel&i=0&res=3840x2160' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/jpeg');
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="bing-wallpaper_travel_${TRAVEL_SLUG}_3840x2160.jpg"`,
    );
    expect(res.body).toBe('fake-jpeg-bytes');
    expect(calls[0]).toBe(`${CDN_BASE}?id=${TRAVEL_ID}&w=3840&h=2160`);
    await app.close();
  });

  it('per res=original non passa w/h e include qlt se richiesto', async () => {
    const { impl, calls } = capturingFetch();
    const app = await buildTestApp(new FakeBingClient(), { fetchImpl: impl });
    const res = await app.inject({ url: '/api/download?theme=travel&i=0&res=original&qlt=100' });
    expect(res.statusCode).toBe(200);
    expect(calls[0]).toBe(`${CDN_BASE}?id=${TRAVEL_ID}&qlt=100`);
    expect(res.headers['content-disposition']).toContain('_original.jpg"');
    await app.close();
  });

  it('slugifica tema e titolo, anche per le key con spazi', async () => {
    const { impl } = capturingFetch();
    const app = await buildTestApp(
      new FakeBingClient({ images: { 'wild animal': travelImagesResponse } }),
      { fetchImpl: impl },
    );
    const res = await app.inject({ url: '/api/download?theme=wild%20animal&i=0&res=1920x1080' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      `attachment; filename="bing-wallpaper_wild-animal_${TRAVEL_SLUG}_1920x1080.jpg"`,
    );
    await app.close();
  });

  it('400 BAD_REQUEST con res sconosciuta o parametri mancanti', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const invalid = [
      '/api/download?theme=travel&i=0',
      '/api/download?theme=travel&i=0&res=123x456',
      '/api/download?theme=travel&i=0&res=banana',
      '/api/download?i=0&res=1920x1080',
    ];
    for (const url of invalid) {
      const res = await app.inject({ url });
      expect(res.statusCode, url).toBe(400);
      expect(res.json(), url).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    }
    await app.close();
  });

  it('inoltra il Range e propaga 206 + Content-Range', async () => {
    const { impl, inits } = capturingFetch({
      status: 206,
      headers: { 'content-range': 'bytes 0-99/200', 'content-length': '100', 'accept-ranges': 'bytes' },
    });
    const app = await buildTestApp(new FakeBingClient(), { fetchImpl: impl });
    const res = await app.inject({
      url: '/api/download?theme=travel&i=0&res=1920x1080',
      headers: { range: 'bytes=0-99' },
    });
    expect(res.statusCode).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 0-99/200');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(inits[0]?.headers).toMatchObject({ range: 'bytes=0-99' });
    await app.close();
  });

  it('404 THEME_NOT_FOUND / IMAGE_NOT_FOUND per tema o indice errati', async () => {
    const app = await buildTestApp(new FakeBingClient(), { fetchImpl: capturingFetch().impl });
    const missingTheme = await app.inject({ url: '/api/download?theme=ghost&i=0&res=original' });
    expect(missingTheme.statusCode).toBe(404);
    expect(missingTheme.json()).toMatchObject({ error: { code: 'THEME_NOT_FOUND' } });

    const outOfRange = await app.inject({ url: '/api/download?theme=travel&i=99&res=1920x1080' });
    expect(outOfRange.statusCode).toBe(404);
    expect(outOfRange.json()).toMatchObject({ error: { code: 'IMAGE_NOT_FOUND' } });
    await app.close();
  });
});
