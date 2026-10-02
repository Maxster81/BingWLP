import { describe, expect, it, vi } from 'vitest';
import { extractImageId, mapThemeCategories, mapThemeImages, type ThemeImageContext } from '../src/bing/mappers';
import type { LoggerLike } from '../src/logger';
import {
  animatedImagesResponse,
  categoriesItIT,
  edgeCasesImagesResponse,
  travelImagesResponse,
} from './fixtures';

/** Id della prima immagine travel nel fixture: cache-buster `v` negli URL. */
const TRAVEL_ID_0 = 'OBGA.Lock2017-B5_AF_DrakensbergGoldenGateNP_shutterstock_538817752';

function travelCtx(overrides: Partial<ThemeImageContext> = {}): ThemeImageContext {
  return {
    themeKey: 'travel',
    market: 'it-IT',
    themeName: 'Viaggi',
    themeType: 'Regular',
    isNew: false,
    ...overrides,
  };
}

describe('mapThemeCategories', () => {
  it('mappa le 11 categorie it-IT con nome localizzato', () => {
    const themes = mapThemeCategories(categoriesItIT);
    expect(themes).toHaveLength(11);
    expect(themes.map((theme) => theme.key)).toEqual([
      'bing',
      'abstract',
      'cat',
      'dog',
      'flower',
      'ocean',
      'space',
      'travel',
      'wild animal',
      'animated',
      'xbox',
    ]);
    expect(themes.find((theme) => theme.key === 'travel')).toEqual({
      key: 'travel',
      name: 'Viaggi',
      type: 'Regular',
      isNew: false,
    });
    expect(themes.find((theme) => theme.key === 'wild animal')?.isNew).toBe(true);
    expect(themes.at(-1)).toEqual({ key: 'xbox', name: 'xbox', type: 'ThemePack', isNew: true });
  });

  it('mette i ThemePack dopo i Regular anche quando arrivano prima', () => {
    const themes = mapThemeCategories({
      pack: { Name: 'Pack', Type: 'ThemePack', IsNew: true },
      primo: { Name: 'Primo', Type: 'Regular' },
      secondo: { Name: 'Secondo', Type: 'Regular' },
    });
    expect(themes.map((theme) => theme.key)).toEqual(['primo', 'secondo', 'pack']);
  });

  it('usa la key quando Name è assente/vuoto e normalizza type/isNew', () => {
    const themes = mapThemeCategories({
      vuoto: { Name: '   ' },
      assente: {},
      strano: { Name: 'Strano', Type: 'Other', IsNew: null },
    });
    expect(themes).toEqual([
      { key: 'vuoto', name: 'vuoto', type: 'Regular', isNew: false },
      { key: 'assente', name: 'assente', type: 'Regular', isNew: false },
      { key: 'strano', name: 'Strano', type: 'Regular', isNew: false },
    ]);
  });
});

describe('mapThemeImages', () => {
  it('mappa i campi del contratto dal payload reale travel', () => {
    const images = mapThemeImages(travelImagesResponse, travelCtx());
    expect(images).toHaveLength(3);
    expect(images[0]).toMatchObject({
      index: 0,
      id: 'OBGA.Lock2017-B5_AF_DrakensbergGoldenGateNP_shutterstock_538817752',
      title: 'Golden Gate Highlands National Park, South Africa',
      description: 'The Drakensberg Formation, Golden Gate Highlands National Park, South Africa',
      headline: 'Golden Gate Highlands National Park, South Africa',
      copyright: '\u00a9 /Shutterstock',
      copyrightUrl:
        'https://www.bing.com/search?q=Golden+Gate+Highlands+National+Park%2c+South+Africa&form=BGALM',
      searchUrl:
        'https://www.bing.com/search?q=Golden+Gate+Highlands+National+Park%2c+South+Africa&form=BGABWCTA7',
      startDate: 'Travel_132',
      themes: ['Travel'],
      sourceType: 'StockImage',
      animated: null,
    });
    // imageHotspots è rumore e non deve finire nel contratto.
    expect(images[0]).not.toHaveProperty('imageHotspots');
    expect(Object.keys(images[1] ?? {}).sort()).toEqual(Object.keys(images[0] ?? {}).sort());
  });

  it('costruisce URL relativi con le dimensioni del contratto e downloadBase', () => {
    const images = mapThemeImages(travelImagesResponse, travelCtx());
    expect(images[0]?.urls).toEqual({
      thumb: `/api/image?mkt=it-IT&theme=travel&i=0&v=${TRAVEL_ID_0}&w=480&h=270`,
      card: `/api/image?mkt=it-IT&theme=travel&i=0&v=${TRAVEL_ID_0}&w=800&h=450`,
      preview: `/api/image?mkt=it-IT&theme=travel&i=0&v=${TRAVEL_ID_0}&w=1280&h=720`,
      full: `/api/image?mkt=it-IT&theme=travel&i=0&v=${TRAVEL_ID_0}&w=1920&h=1080`,
      original: `/api/image?mkt=it-IT&theme=travel&i=0&v=${TRAVEL_ID_0}`,
    });
    expect(images[2]?.downloadBase).toBe('/api/download?mkt=it-IT&theme=travel&i=2');
  });

  it('percent-encoda le key con spazi (case-sensitive, \"wild animal\")', () => {
    const images = mapThemeImages(travelImagesResponse, travelCtx({ themeKey: 'wild animal' }));
    expect(images[0]?.urls.card).toBe(`/api/image?mkt=it-IT&theme=wild%20animal&i=0&v=${TRAVEL_ID_0}&w=800&h=450`);
    expect(images[0]?.downloadBase).toBe('/api/download?mkt=it-IT&theme=wild%20animal&i=0');
  });

  it('mappa i temi animati con poster (full) e video MP4', () => {
    const images = mapThemeImages(animatedImagesResponse, travelCtx({ themeKey: 'animated' }));
    expect(images).toHaveLength(2);
    expect(images[0]?.animated).toEqual({
      name: 'Petals',
      posterUrl: '/api/image?mkt=it-IT&theme=animated&i=0&v=OBGA.Animated_Petals.jpg&w=1920&h=1080',
      videoUrl:
        'https://download.microsoft.com/download/7cda3eda-ffdb-4921-ac2c-9b4050888f77/petals-video.mp4',
    });
    expect(images[1]?.animated?.name).toBe('Tree');
    expect(images[1]?.animated?.videoUrl).toContain('flower-video.mp4');
  });
});

describe('mapThemeImages — casi limite', () => {
  const logger: LoggerLike = { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() };

  it('scarta gli urlbase malformati, logga un warn e re-indicizza', () => {
    const warn = vi.fn();
    const images = mapThemeImages(edgeCasesImagesResponse, travelCtx({ logger: { ...logger, warn } }));
    expect(images.map((image) => image.id)).toEqual([
      'OBGA.Keep_Me.jpg',
      'OBGA.Percent+Encoded',
      'OBGA.No_fields',
      'OBGA.No_video_asset',
      'OBGA.Reversed_assets',
    ]);
    expect(images.map((image) => image.index)).toEqual([0, 1, 2, 3, 4]);
    expect(warn).toHaveBeenCalledTimes(3);
    expect(String(warn.mock.calls[0]?.[0])).toContain('urlbase malformato');
  });

  it('non crasha su campi mancanti/null e applica i default del contratto', () => {
    const images = mapThemeImages(edgeCasesImagesResponse, travelCtx());
    expect(images[2]).toMatchObject({
      title: '',
      description: '',
      headline: '',
      copyright: '',
      copyrightUrl: null,
      startDate: '',
      themes: [],
      sourceType: '',
      animated: null,
    });
    expect(images[2]?.urls.original).toBe('/api/image?mkt=it-IT&theme=travel&i=2&v=OBGA.No_fields');
  });

  it('searchUrl: primo SearchUrls non vuoto, con fallback su copyrightlink', () => {
    const images = mapThemeImages(edgeCasesImagesResponse, travelCtx());
    expect(images[2]?.searchUrl).toBe('https://www.bing.com/search?q=secondo');
    expect(images[0]?.searchUrl).toBeNull();
    const withCopyrightlink = mapThemeImages(
      { images: [{ urlbase: 'https://www.bing.com/th?id=OBGA.Fb', copyrightlink: 'https://bing.example/credits' }] },
      travelCtx(),
    );
    expect(withCopyrightlink[0]?.searchUrl).toBe('https://bing.example/credits');
    expect(withCopyrightlink[0]?.copyrightUrl).toBe('https://bing.example/credits');
  });

  it('animated è null senza asset video, ma resta valorizzato se il video non è il primo asset', () => {
    const images = mapThemeImages(edgeCasesImagesResponse, travelCtx());
    expect(images[3]?.animated).toBeNull();
    expect(images[4]?.animated).toEqual({
      name: 'Invertito',
      posterUrl: '/api/image?mkt=it-IT&theme=travel&i=4&v=OBGA.Reversed_assets&w=1920&h=1080',
      videoUrl: 'https://example.com/movie.mp4',
    });
  });

  it('ritorna un array vuoto per payload senza images', () => {
    expect(mapThemeImages({}, travelCtx())).toEqual([]);
    expect(mapThemeImages({ images: null, imageCount: 0 }, travelCtx())).toEqual([]);
  });
});

describe('extractImageId', () => {
  it('estrae e decodifica l\'id dall\'urlbase', () => {
    expect(extractImageId('https://www.bing.com/th?id=OBGA.Xyz.jpg')).toBe('OBGA.Xyz.jpg');
    expect(extractImageId('https://www.bing.com/th?foo=1&id=OBGA.Q')).toBe('OBGA.Q');
    expect(extractImageId('https://www.bing.com/th?id=OBGA.Percent%2BEncoded')).toBe(
      'OBGA.Percent+Encoded',
    );
  });

  it('ritorna null per valori assenti o malformati', () => {
    expect(extractImageId(null)).toBeNull();
    expect(extractImageId(undefined)).toBeNull();
    expect(extractImageId('   ')).toBeNull();
    expect(extractImageId('https://www.bing.com/th?id=')).toBeNull();
    expect(extractImageId('OBGA.SoloId')).toBeNull();
    expect(extractImageId('non-una-url')).toBeNull();
  });
});
