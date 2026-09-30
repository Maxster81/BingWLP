import { describe, expect, it } from 'vitest';
import { buildTestApp, FakeBingClient, networkFailure, testConfig } from './fixtures';

const TRAVEL_COVER = '/api/image?mkt=it-IT&theme=travel&i=0&w=800&h=450';

describe('GET /api/health', () => {
  it('riporta versione, uptime, upstream e statistiche cache', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const res = await app.inject({ url: '/api/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body).toMatchObject({
      status: 'ok',
      version: '1.0.0',
      upstream: 'ok',
      cache: { themes: 0, images: 0, entries: 0 },
    });
    expect(typeof body.uptimeSec).toBe('number');
    expect(Number.isNaN(Date.parse(String(body.timestamp)))).toBe(false);
    await app.close();
  });

  it('segnala degraded quando tutti i giri verso Bing sono falliti', async () => {
    const app = await buildTestApp(new FakeBingClient({ status: 'down' }));
    const res = await app.inject({ url: '/api/health' });
    expect(res.json()).toMatchObject({ status: 'degraded', upstream: 'down' });
    await app.close();
  });

  it('riflette le entry in cache dopo una chiamata a /api/themes', async () => {
    const app = await buildTestApp(new FakeBingClient());
    await app.inject({ url: '/api/themes' });
    const res = await app.inject({ url: '/api/health' });
    expect(res.json()).toMatchObject({ cache: { themes: 1, images: 11, entries: 12 } });
    await app.close();
  });
});

describe('GET /api/config', () => {
  it('espone market, resolutions, limiti e TTL', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const res = await app.inject({ url: '/api/config' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      defaultMarket: string;
      markets: Array<{ code: string; name: string; flag: string }>;
      resolutions: Array<{ key: string; recommended?: boolean; group: string }>;
      defaultResolution: string;
      limits: { maxWidth: number; maxHeight: number };
      cacheTtlSec: { themes: number; images: number };
    };
    expect(body.defaultMarket).toBe('it-IT');
    expect(body.markets[0]).toEqual({
      code: 'it-IT',
      name: 'Italiano (Italia)',
      flag: '\ud83c\uddee\ud83c\uddf9',
    });
    expect(body.defaultResolution).toBe('1920x1080');
    expect(body.resolutions).toHaveLength(23);
    expect(body.resolutions.find((item) => item.key === '1920x1080')).toMatchObject({
      group: 'desktop',
      recommended: true,
    });
    expect(body.resolutions.find((item) => item.key === 'original')).toMatchObject({
      group: 'original',
    });
    expect(body.limits).toEqual({ maxWidth: 8000, maxHeight: 8000 });
    expect(body.cacheTtlSec).toEqual({ themes: 21600, images: 3600 });
    await app.close();
  });

  it('usa il DEFAULT_MARKET configurato', async () => {
    const app = await buildTestApp(new FakeBingClient(), {
      config: testConfig({ DEFAULT_MARKET: 'en-GB' }),
    });
    const res = await app.inject({ url: '/api/config' });
    expect((res.json() as { defaultMarket: string }).defaultMarket).toBe('en-GB');
    await app.close();
  });
});

describe('GET /api/resolutions', () => {
  it('ritorna il default e tutti i preset', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const res = await app.inject({ url: '/api/resolutions' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { default: string; resolutions: Array<{ key: string }> };
    expect(body.default).toBe('1920x1080');
    expect(body.resolutions).toHaveLength(23);
    expect(body.resolutions.map((item) => item.key)).toContain('3840x2160');
    expect(body.resolutions[0]?.key).toBe('original');
    await app.close();
  });
});

describe('GET /api/themes', () => {
  it('ritorna i temi arricchiti con count e cover', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const res = await app.inject({ url: '/api/themes' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      market: string;
      fetchedAt: string;
      stale: boolean;
      count: number;
      themes: Array<Record<string, unknown>>;
    };
    expect(body.market).toBe('it-IT');
    expect(body.count).toBe(11);
    expect(body.stale).toBe(false);
    expect(body.themes.find((theme) => theme.key === 'travel')).toMatchObject({
      name: 'Viaggi',
      type: 'Regular',
      isNew: false,
      imageCount: 3,
      coverUrl: TRAVEL_COVER,
    });
    expect(body.themes.find((theme) => theme.key === 'xbox')).toMatchObject({
      type: 'ThemePack',
      isNew: true,
    });
    await app.close();
  });

  it('accetta mkt valido e include=images', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const res = await app.inject({ url: '/api/themes?mkt=en-US&include=images' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { market: string; themes: Array<Record<string, unknown>> };
    expect(body.market).toBe('en-US');
    const travel = body.themes.find((theme) => theme.key === 'travel') as
      | { images?: unknown[] }
      | undefined;
    expect(travel?.images).toHaveLength(3);
    await app.close();
  });

  it('400 BAD_REQUEST con mkt malformato', async () => {
    const app = await buildTestApp(new FakeBingClient());
    for (const url of ['/api/themes?mkt=italiano', '/api/themes?mkt=IT-it', '/api/themes?refresh=x']) {
      const res = await app.inject({ url });
      expect(res.statusCode, url).toBe(400);
      expect(res.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } });
    }
    await app.close();
  });

  it('503 senza cache quando Bing è irraggiungibile', async () => {
    const app = await buildTestApp(
      new FakeBingClient({ categories: () => Promise.reject(networkFailure()) }),
    );
    const res = await app.inject({ url: '/api/themes' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'UPSTREAM_UNAVAILABLE' } });
    await app.close();
  });
});

describe('GET /api/themes/:key/images', () => {
  it('200 con tema e immagini', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const res = await app.inject({ url: '/api/themes/travel/images' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      market: string;
      stale: boolean;
      theme: Record<string, unknown>;
      count: number;
      images: Array<Record<string, unknown>>;
    };
    expect(body.market).toBe('it-IT');
    expect(body.stale).toBe(false);
    expect(body.theme).toEqual({ key: 'travel', name: 'Viaggi', type: 'Regular', isNew: false });
    expect(body.count).toBe(3);
    expect(body.images[0]).toMatchObject({
      index: 0,
      id: 'OBGA.Lock2017-B5_AF_DrakensbergGoldenGateNP_shutterstock_538817752',
      urls: { card: '/api/image?mkt=it-IT&theme=travel&i=0&w=800&h=450' },
    });
    await app.close();
  });

  it('gestisce le key con spazi (percent-encoded) e resta case-sensitive', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const spaced = await app.inject({ url: '/api/themes/wild%20animal/images' });
    expect(spaced.statusCode).toBe(200);
    expect(spaced.json()).toMatchObject({ theme: { key: 'wild animal', name: 'Animale selvatico' } });

    const wrongCase = await app.inject({ url: '/api/themes/Travel/images' });
    expect(wrongCase.statusCode).toBe(404);
    expect(wrongCase.json()).toMatchObject({ error: { code: 'THEME_NOT_FOUND' } });
    await app.close();
  });

  it('404 THEME_NOT_FOUND per un tema inesistente', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const res = await app.inject({ url: '/api/themes/nonexistent/images' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({
      error: { code: 'THEME_NOT_FOUND', message: expect.stringContaining('nonexistent') },
    });
    await app.close();
  });
});

describe('Cache-Control delle API JSON', () => {
  it('le liste che ruotano ogni giorno sono no-store', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const themes = await app.inject({ url: '/api/themes' });
    expect(themes.headers['cache-control']).toBe('no-store');
    const images = await app.inject({ url: '/api/themes/travel/images' });
    expect(images.headers['cache-control']).toBe('no-store');
    await app.close();
  });

  it('config e resolutions (statiche fino al deploy) hanno cache breve esplicita', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const config = await app.inject({ url: '/api/config' });
    expect(config.headers['cache-control']).toBe('public, max-age=3600');
    const resolutions = await app.inject({ url: '/api/resolutions' });
    expect(resolutions.headers['cache-control']).toBe('public, max-age=3600');
    await app.close();
  });
});

describe('rotte inesistenti', () => {
  it('404 JSON con code NOT_FOUND per /api/* sconosciute', async () => {
    const app = await buildTestApp(new FakeBingClient());
    const res = await app.inject({ url: '/api/sconosciuta' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    await app.close();
  });
});
