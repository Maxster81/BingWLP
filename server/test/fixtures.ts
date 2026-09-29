import type { FastifyInstance } from 'fastify';
import type { BingClient } from '../src/bing/client';
import type { BingImagesResponse, BingThemeCategoriesResponse } from '../src/bing/types';
import { buildApp } from '../src/app';
import { loadConfig, type AppConfig } from '../src/config';
import type { UpstreamStatus } from '../src/domain/types';
import { AppError } from '../src/errors';
import { NullImageStore } from '../src/store/null-store';
import type { ImageStore } from '../src/store/types';

/**
 * Payload REALI di Bing (estratti con curl il 2026-09-28, mkt=it-IT), ridotti ai campi
 * che ci interessano. Le parti rumorose (contorni degli hotspot, tooltips) sono accorciate
 * ma mantengono la forma originale.
 */

export const categoriesItIT: BingThemeCategoriesResponse = {
  bing: { Name: 'Bing', Type: 'Regular', IsNew: false, Images: [] },
  abstract: {
    Name: 'Sunto',
    Type: 'Regular',
    IsNew: false,
    Images: ['https://www.bing.com/th?id=OBGA.OIGP.AWX_qj092.M2bZLLsX2J_Preview'],
  },
  cat: { Name: 'Gatto', Type: 'Regular', IsNew: false, Images: [] },
  dog: { Name: 'Cane', Type: 'Regular', IsNew: false, Images: [] },
  flower: { Name: 'Fiore', Type: 'Regular', IsNew: false, Images: [] },
  ocean: { Name: 'Oceano', Type: 'Regular', IsNew: false, Images: [] },
  space: { Name: 'Barra spaziatrice', Type: 'Regular', IsNew: false, Images: [] },
  travel: { Name: 'Viaggi', Type: 'Regular', IsNew: false, Images: [] },
  'wild animal': { Name: 'Animale selvatico', Type: 'Regular', IsNew: true, Images: [] },
  animated: { Name: 'Animato', Type: 'Regular', IsNew: false, Images: [] },
  xbox: { Name: 'xbox', Type: 'ThemePack', IsNew: true, Images: [] },
};

/** hpimages?mkt=it-IT&theme=travel → 8 immagini, ne teniamo 3 con i campi reali. */
export const travelImagesResponse: BingImagesResponse = {
  images: [
    {
      startdate: 'Travel_132',
      fullstartdate: '',
      urlbase:
        'https://www.bing.com/th?id=OBGA.Lock2017-B5_AF_DrakensbergGoldenGateNP_shutterstock_538817752',
      copyrighttext: '© /Shutterstock',
      copyrightlink:
        'https://www.bing.com/search?q=Golden+Gate+Highlands+National+Park%2c+South+Africa&form=BGALM',
      title: 'Golden Gate Highlands National Park, South Africa',
      description: 'The Drakensberg Formation, Golden Gate Highlands National Park, South Africa',
      headline: 'Golden Gate Highlands National Park, South Africa',
      theme: ['Travel'],
      travelUrl: 'https://www.bing.com/travel?&form=BGATL',
      sourceType: 'StockImage',
      detectedRegion: 'us',
      topRightCTAData: {
        SearchUrls: [
          'https://www.bing.com/search?q=Golden+Gate+Highlands+National+Park%2c+South+Africa&form=BGABWCTA7',
        ],
        ButtonText: 'Search the web to learn more about this picture',
      },
      imageHotspots: [
        { boundingBox: { X: 371, Y: 597, Width: 2420, Height: 2118, Label: 'tower', ContourList: [] } },
      ],
      AnimatedWP: null,
    },
    {
      startdate: 'Travel_133',
      urlbase:
        'https://www.bing.com/th?id=OBGA.Lock2017-B5_AF_UnhlangaPierDurban_shutterstock_362786636',
      copyrighttext: '© /Shutterstock',
      copyrightlink: 'https://www.bing.com/search?q=Umhlanga+pier%2c+Durban&form=BGALM',
      title: 'Umhlanga pier, Durban, South Africa',
      description: 'Umhlanga pier, Durban, South Africa',
      headline: 'Umhlanga pier, Durban',
      theme: ['Travel'],
      sourceType: 'StockImage',
      topRightCTAData: { SearchUrls: ['https://www.bing.com/search?q=Umhlanga+pier&form=BGABWCTA7'] },
      imageHotspots: [{ boundingBox: { X: 100, Y: 200 } }],
      AnimatedWP: null,
    },
    {
      startdate: 'Travel_134',
      urlbase:
        'https://www.bing.com/th?id=OBGA.Lock2017-B6_SunwaptaFallsJasperNPAlbertaCA_shutterstock_497091511',
      copyrighttext: '© Shutterstock',
      copyrightlink: 'https://www.bing.com/search?q=Sunwapta+Falls&form=BGALM',
      title: 'Sunwapta Falls,  Alberta, Canada',
      description: 'Sunwapta Falls, Alberta, Canada',
      headline: 'Sunwapta Falls, Alberta',
      theme: ['Travel'],
      sourceType: 'StockImage',
      topRightCTAData: { SearchUrls: ['https://www.bing.com/search?q=Sunwapta+Falls&form=BGABWCTA7'] },
      imageHotspots: [],
      AnimatedWP: null,
    },
  ],
  // Bing dichiara 8 immagini: il conteggio restituito usa sempre l'array, non questo campo.
  imageCount: 8,
};

/** hpimages?mkt=it-IT&theme=animated → 6 immagini con video MP4; `imageCount` è 0 (!). */
export const animatedImagesResponse: BingImagesResponse = {
  images: [
    {
      startdate: 'Animated_0',
      urlbase: 'https://www.bing.com/th?id=OBGA.Animated_Petals.jpg',
      copyrighttext: '© Microsoft Corporation',
      copyrightlink: 'https://www.bing.com/search?q=Floating+petals&form=BGALM',
      title: 'Floating petals in the Sky',
      description: 'Petals floating in the sky.',
      headline: 'Floating Petals',
      theme: ['Animated'],
      sourceType: 'StockImage',
      topRightCTAData: null,
      imageHotspots: null,
      AnimatedWP: {
        Version: '1.0.0',
        Name: 'Petals',
        Assets: [
          {
            Url: 'https://download.microsoft.com/download/7cda3eda-ffdb-4921-ac2c-9b4050888f77/petals-video.mp4',
            FileName: 'video.mp4',
          },
          {
            Url: 'https://download.microsoft.com/download/7cda3eda-ffdb-4921-ac2c-9b4050888f77/animassets-index.html',
            FileName: 'index.html',
          },
        ],
      },
    },
    {
      startdate: 'Animated_1',
      urlbase: 'https://www.bing.com/th?id=OBGA.Animated_Tree.jpg',
      copyrighttext: '© Microsoft Corporation',
      copyrightlink: 'https://www.bing.com/search?q=A+dense+cluster+of+small+white+blossoms&form=BGALM',
      title: 'Clouds of white flowers',
      description: 'A dense cluster of small white blossoms.',
      headline: 'Clouds of White Flowers',
      theme: ['Animated'],
      sourceType: 'StockImage',
      topRightCTAData: null,
      imageHotspots: null,
      AnimatedWP: {
        Version: '1.0.0',
        Name: 'Tree',
        Assets: [
          {
            Url: 'https://download.microsoft.com/download/7cda3eda-ffdb-4921-ac2c-9b4050888f77/flower-video.mp4',
            FileName: 'video.mp4',
          },
          {
            Url: 'https://download.microsoft.com/download/7cda3eda-ffdb-4921-ac2c-9b4050888f77/animassets-index.html',
            FileName: 'index.html',
          },
        ],
      },
    },
  ],
  imageCount: 0,
};

/** Tema inesistente: HTTP 200 con array vuoto → per il contratto è 404 THEME_NOT_FOUND. */
export const emptyImagesResponse: BingImagesResponse = {
  images: [],
  tooltips: { loading: null, previous: null, next: null },
  imageCount: 0,
};

/** Casi limite: campi null, `urlbase` malformato, asset video assente/invertito. */
export const edgeCasesImagesResponse: BingImagesResponse = {
  images: [
    {
      urlbase: 'https://www.bing.com/th?id=OBGA.Keep_Me.jpg',
      title: 'Titolo valido',
      theme: ['Travel'],
      sourceType: 'StockImage',
    },
    { urlbase: null, title: 'Senza urlbase' },
    {},
    { urlbase: 'non-una-url-bing', title: 'Malformata' },
    { urlbase: 'https://www.bing.com/th?id=OBGA.Percent%2BEncoded', title: 'Con percent-encoding' },
    {
      urlbase: 'https://www.bing.com/th?id=OBGA.No_fields',
      topRightCTAData: { SearchUrls: ['', '   ', 'https://www.bing.com/search?q=secondo'] },
    },
    {
      urlbase: 'https://www.bing.com/th?id=OBGA.No_video_asset',
      AnimatedWP: {
        Name: 'Senza video',
        Assets: [{ Url: 'https://example.com/animassets-index.html', FileName: 'index.html' }],
      },
    },
    {
      urlbase: 'https://www.bing.com/th?id=OBGA.Reversed_assets',
      AnimatedWP: {
        Name: 'Invertito',
        Assets: [
          { Url: 'https://example.com/animassets-index.html', FileName: 'index.html' },
          { Url: 'https://example.com/movie.mp4', FileName: 'movie.mp4' },
        ],
      },
    },
  ],
  imageCount: 8,
};

/** Immagini per tema usate dal fake client di default. */
export const defaultImagesByTheme: Record<string, BingImagesResponse> = {
  travel: travelImagesResponse,
  animated: animatedImagesResponse,
};

/** Comportamento del fake: valore fisso, funzione (per simulare errori) o mappa per tema. */
export type FakeBingOptions = {
  categories?: BingThemeCategoriesResponse | (() => Promise<BingThemeCategoriesResponse>);
  images?:
    | Record<string, BingImagesResponse>
    | ((mkt: string, themeKey: string) => Promise<BingImagesResponse>);
  status?: UpstreamStatus;
};

/** Client Bing finto: nessuna rete, chiamate registrate per le asserzioni. */
export class FakeBingClient implements BingClient {
  readonly categoryCalls: string[] = [];
  readonly imageCalls: Array<{ mkt: string; theme: string }> = [];
  private readonly options: FakeBingOptions;

  constructor(options: FakeBingOptions = {}) {
    this.options = options;
  }

  async getThemeCategories(mkt: string): Promise<BingThemeCategoriesResponse> {
    this.categoryCalls.push(mkt);
    const categories = this.options.categories ?? categoriesItIT;
    return typeof categories === 'function' ? categories() : categories;
  }

  async getThemeImages(mkt: string, themeKey: string): Promise<BingImagesResponse> {
    this.imageCalls.push({ mkt, theme: themeKey });
    const images = this.options.images;
    if (typeof images === 'function') return images(mkt, themeKey);
    return images?.[themeKey] ?? defaultImagesByTheme[themeKey] ?? emptyImagesResponse;
  }

  getUpstreamStatus(): UpstreamStatus {
    return this.options.status ?? 'ok';
  }
}

/** Config di test: statico disattivato e niente log, override con `env`. */
export function testConfig(env: Record<string, string | undefined> = {}): AppConfig {
  return loadConfig({ SERVE_STATIC: 'false', LOG_LEVEL: 'silent', ...env });
}

/** Fetch che fallisce: rende evidente qualunque chiamata di rete non prevista nei test. */
export const failingFetch: typeof fetch = async (input) => {
  throw new Error(`fetch non atteso nei test: ${String(input)}`);
};

/** Fetch finto che risponde con un JPEG; `init` per status/header (es. 206 + Content-Range). */
export function fakeJpegFetch(
  body = 'fake-jpeg-bytes',
  init: { status?: number; headers?: Record<string, string> } = {},
): typeof fetch {
  return async () =>
    new Response(body, {
      status: init.status ?? 200,
      headers: { 'content-type': 'image/jpeg', ...(init.headers ?? {}) },
    });
}

export type TestAppOptions = {
  config?: AppConfig;
  fetchImpl?: typeof fetch;
  store?: ImageStore;
};

export async function buildTestApp(
  bing: BingClient,
  options: TestAppOptions = {},
): Promise<FastifyInstance> {
  return buildApp({
    config: options.config ?? testConfig(),
    bingClient: bing,
    store: options.store ?? new NullImageStore(),
    logger: false,
    fetchImpl: options.fetchImpl ?? failingFetch,
    version: '1.0.0',
  });
}

/** Errore di rete generico, per simulare "Bing irraggiungibile" senza rete vera. */
export function networkFailure(): AppError {
  return new AppError('UPSTREAM_UNAVAILABLE', 'Bing non raggiungibile (fake)');
}
