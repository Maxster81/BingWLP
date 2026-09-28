import { describe, expect, it } from 'vitest';
import {
  buildQuery,
  configUrl,
  downloadUrl,
  healthUrl,
  imageUrl,
  resolutionsUrl,
  themeImagesUrl,
  themesUrl,
} from './urls';

describe('lib/urls — imageUrl', () => {
  it('costruisce /api/image con i parametri nell’ordine del contratto', () => {
    expect(imageUrl({ theme: 'travel', index: 0, market: 'it-IT', width: 800, height: 450 })).toBe(
      '/api/image?mkt=it-IT&theme=travel&i=0&w=800&h=450',
    );
  });

  it('codifica gli spazi nella themeKey (le chiavi Bing possono contenerli)', () => {
    expect(imageUrl({ theme: 'wild animal', index: 3 })).toBe('/api/image?theme=wild%20animal&i=3');
  });

  it('aggiunge qlt, mode e dl solo quando richiesti', () => {
    expect(imageUrl({ theme: 'travel', index: 1, quality: 100, mode: 'stream', download: true })).toBe(
      '/api/image?theme=travel&i=1&qlt=100&mode=stream&dl=1',
    );
  });

  it('omette i parametri opzionali non valorizzati', () => {
    expect(imageUrl({ theme: 'travel', index: 2, market: null, width: undefined })).toBe(
      '/api/image?theme=travel&i=2',
    );
  });

  it('accetta una base alternativa', () => {
    expect(imageUrl({ theme: 'travel', index: 0, base: '/api/custom' })).toBe('/api/custom?theme=travel&i=0');
  });
});

describe('lib/urls — downloadUrl', () => {
  const base = '/api/download?mkt=it-IT&theme=travel&i=0';

  it('appende &res=<chiave> alla downloadBase', () => {
    expect(downloadUrl(base, '1920x1080')).toBe(`${base}&res=1920x1080`);
  });

  it('usa ? quando la base non ha query', () => {
    expect(downloadUrl('/api/download', 'original')).toBe('/api/download?res=original');
  });

  it('non duplica il separatore se la base termina con ? o &', () => {
    expect(downloadUrl('/api/download?', 'x')).toBe('/api/download?res=x');
    expect(downloadUrl('/api/download?mkt=it-IT&', 'x')).toBe('/api/download?mkt=it-IT&res=x');
  });

  it('preserva le risoluzioni non standard', () => {
    expect(downloadUrl(base, '3840x2160')).toContain('res=3840x2160');
    expect(downloadUrl(base, 'original')).toContain('res=original');
  });
});

describe('lib/urls — endpoint', () => {
  it('themes con e senza market', () => {
    expect(themesUrl('it-IT')).toBe('/api/themes?mkt=it-IT');
    expect(themesUrl(null)).toBe('/api/themes');
    expect(themesUrl()).toBe('/api/themes');
  });

  it('immagini di un tema', () => {
    expect(themeImagesUrl('en-US', 'wild animal')).toBe('/api/themes/wild%20animal/images?mkt=en-US');
  });

  it('config, resolutions e health', () => {
    expect(configUrl()).toBe('/api/config');
    expect(resolutionsUrl()).toBe('/api/resolutions');
    expect(healthUrl()).toBe('/api/health');
  });

  it('buildQuery salta i valori vuoti', () => {
    expect(buildQuery([
      ['a', 1],
      ['b', null],
      ['c', undefined],
      ['d', ''],
      ['e', 'x y'],
    ])).toBe('a=1&e=x%20y');
  });
});
