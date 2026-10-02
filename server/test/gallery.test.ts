import { describe, expect, it } from 'vitest';
import type { BingClient } from '../src/bing/client';
import { TtlCache } from '../src/cache/ttl-cache';
import { AppError } from '../src/errors';
import { Gallery, type ImagesPayload, type ThemesPayload } from '../src/services/gallery';
import {
  categoriesItIT,
  defaultImagesByTheme,
  emptyImagesResponse,
  FakeBingClient,
  networkFailure,
  testConfig,
} from './fixtures';

function makeGallery(
  bing: BingClient,
  options: { now?: () => number; env?: Record<string, string> } = {},
): Gallery {
  const now = options.now ?? (() => Date.now());
  return new Gallery({
    config: testConfig(options.env),
    bing,
    themeCache: new TtlCache<ThemesPayload>({ now }),
    imageCache: new TtlCache<ImagesPayload>({ now }),
  });
}

const TRAVEL_COVER = '/api/image?mkt=it-IT&theme=travel&i=0&v=OBGA.Lock2017-B5_AF_DrakensbergGoldenGateNP_shutterstock_538817752&w=800&h=450';

describe('Gallery.getThemes', () => {
  it('arricchisce ogni tema con imageCount e coverUrl (happy path)', async () => {
    const bing = new FakeBingClient();
    const gallery = makeGallery(bing);

    const result = await gallery.getThemes('it-IT');

    expect(result.market).toBe('it-IT');
    expect(result.count).toBe(11);
    expect(result.stale).toBe(false);
    expect(Number.isNaN(Date.parse(result.fetchedAt))).toBe(false);
    expect(result.themes.find((theme) => theme.key === 'travel')).toMatchObject({
      name: 'Viaggi',
      type: 'Regular',
      isNew: false,
      imageCount: 3,
      coverUrl: TRAVEL_COVER,
    });
    expect(result.themes.find((theme) => theme.key === 'animated')).toMatchObject({ imageCount: 2 });
    // tema esistente ma senza immagini: 0 e placeholder lato frontend
    expect(result.themes.find((theme) => theme.key === 'bing')).toMatchObject({
      imageCount: 0,
      coverUrl: null,
    });
    expect(bing.imageCalls).toHaveLength(11);
  });

  it('include images=images quando richiesto', async () => {
    const gallery = makeGallery(new FakeBingClient());
    const result = await gallery.getThemes('it-IT', { includeImages: true });
    const travel = result.themes.find((theme) => theme.key === 'travel');
    expect(travel?.images).toHaveLength(3);
    expect(travel?.images?.[0]?.id).toContain('GoldenGateNP');
  });

  it('usa la cache finché fresca e rifetcha con refresh=1', async () => {
    const bing = new FakeBingClient();
    const gallery = makeGallery(bing);

    await gallery.getThemes('it-IT');
    await gallery.getThemes('it-IT');
    expect(bing.categoryCalls).toHaveLength(1);
    expect(bing.imageCalls).toHaveLength(11);

    await gallery.getThemes('it-IT', { refresh: true });
    expect(bing.categoryCalls).toHaveLength(2);
    expect(bing.imageCalls).toHaveLength(22);
  });

  it('un tema che fallisce non fa fallire la risposta (imageCount null + stale)', async () => {
    const bing = new FakeBingClient({
      images: (_mkt, themeKey) =>
        themeKey === 'travel'
          ? Promise.reject(networkFailure())
          : Promise.resolve(defaultImagesByTheme[themeKey] ?? emptyImagesResponse),
    });
    const gallery = makeGallery(bing);

    const result = await gallery.getThemes('it-IT');

    expect(result.count).toBe(11);
    expect(result.stale).toBe(true);
    expect(result.themes.find((theme) => theme.key === 'travel')).toMatchObject({
      imageCount: null,
      coverUrl: null,
    });
    expect(result.themes.find((theme) => theme.key === 'cat')).toMatchObject({ imageCount: 0 });
  });

  it('espone le statistiche di cache per /api/health', async () => {
    const gallery = makeGallery(new FakeBingClient());
    await gallery.getThemes('it-IT');
    expect(gallery.cacheStats()).toEqual({ themes: 1, images: 11, entries: 12 });
  });
});

describe('Gallery.getThemeImages', () => {
  it('ritorna tema e immagini (200 con count) per una key esistente', async () => {
    const gallery = makeGallery(new FakeBingClient());
    const result = await gallery.getThemeImages('it-IT', 'travel');

    expect(result).toMatchObject({ market: 'it-IT', count: 3, stale: false });
    expect(result.theme).toEqual({ key: 'travel', name: 'Viaggi', type: 'Regular', isNew: false });
    expect(result.images[0]?.id).toBe(
      'OBGA.Lock2017-B5_AF_DrakensbergGoldenGateNP_shutterstock_538817752',
    );
    expect(result.images[2]?.urls.original).toBe(
      '/api/image?mkt=it-IT&theme=travel&i=2&v=OBGA.Lock2017-B6_SunwaptaFallsJasperNPAlbertaCA_shutterstock_497091511',
    );
  });

  it('funziona con le key case-sensitive che contengono spazi', async () => {
    const gallery = makeGallery(new FakeBingClient());
    const result = await gallery.getThemeImages('it-IT', 'wild animal');
    expect(result.theme.name).toBe('Animale selvatico');
    expect(result.count).toBe(0);
  });

  it('404 THEME_NOT_FOUND per key sconosciute (case-sensitive)', async () => {
    const gallery = makeGallery(new FakeBingClient());
    await expect(gallery.getThemeImages('it-IT', 'nonexistent')).rejects.toMatchObject({
      code: 'THEME_NOT_FOUND',
      statusCode: 404,
    });
    await expect(gallery.getThemeImages('it-IT', 'Travel')).rejects.toMatchObject({
      code: 'THEME_NOT_FOUND',
    });
  });
});

describe('Gallery.getImageEntry', () => {
  it('risolve l\'immagine per indice e propaga lo stale', async () => {
    const gallery = makeGallery(new FakeBingClient());
    const entry = await gallery.getImageEntry('it-IT', 'travel', 1);
    expect(entry.image.index).toBe(1);
    expect(entry.image.downloadBase).toBe('/api/download?mkt=it-IT&theme=travel&i=1');
    expect(entry.theme.key).toBe('travel');
    expect(entry.stale).toBe(false);
  });

  it('404 IMAGE_NOT_FOUND se l\'indice è fuori range', async () => {
    const gallery = makeGallery(new FakeBingClient());
    await expect(gallery.getImageEntry('it-IT', 'travel', 99)).rejects.toMatchObject({
      code: 'IMAGE_NOT_FOUND',
      statusCode: 404,
    });
  });
});

describe('degrado upstream', () => {
  function flakyBing(isDown: () => boolean): FakeBingClient {
    return new FakeBingClient({
      categories: () => (isDown() ? Promise.reject(networkFailure()) : Promise.resolve(categoriesItIT)),
      images: (_mkt, themeKey) =>
        isDown()
          ? Promise.reject(networkFailure())
          : Promise.resolve(defaultImagesByTheme[themeKey] ?? emptyImagesResponse),
    });
  }

  it('con cache scaduta risponde stale invece di 5xx', async () => {
    let clock = 1_000_000;
    let down = false;
    const gallery = makeGallery(flakyBing(() => down), { now: () => clock });

    const first = await gallery.getThemes('it-IT');
    expect(first.stale).toBe(false);

    down = true;
    clock += 7 * 60 * 60 * 1000; // oltre CACHE_TTL_THEMES_SEC (6h)
    const second = await gallery.getThemes('it-IT');

    expect(second.stale).toBe(true);
    expect(second.count).toBe(11);
    expect(second.fetchedAt).toBe(first.fetchedAt);
    expect(second.themes.find((theme) => theme.key === 'travel')).toMatchObject({
      imageCount: 3,
      coverUrl: TRAVEL_COVER,
    });
  });

  it('senza cache risponde 503 UPSTREAM_UNAVAILABLE', async () => {
    const gallery = makeGallery(flakyBing(() => true));
    await expect(gallery.getThemes('it-IT')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      statusCode: 503,
    });
    await expect(gallery.getThemeImages('it-IT', 'travel')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
    });
  });

  it('propaga il codice specifico del client (es. 504 timeout)', async () => {
    const gallery = makeGallery(
      new FakeBingClient({
        categories: () => Promise.reject(new AppError('UPSTREAM_TIMEOUT', 'timeout fake')),
      }),
    );
    await expect(gallery.getThemes('it-IT')).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      statusCode: 504,
    });
  });
});
