import { describe, expect, it } from 'vitest';
import { HttpBingClient } from '../src/bing/client';
import { categoriesItIT, testConfig, travelImagesResponse } from './fixtures';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function makeClient(fetchImpl: typeof fetch, extra: { outcomeWindow?: number } = {}): HttpBingClient {
  return new HttpBingClient({
    config: testConfig(),
    fetchImpl,
    retryBaseDelayMs: 1,
    ...(extra.outcomeWindow === undefined ? {} : { outcomeWindow: extra.outcomeWindow }),
  });
}

describe('HttpBingClient', () => {
  it('chiama gli endpoint giusti e valida il payload', async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      urls.push(url);
      return url.includes('GetThemeCategories')
        ? jsonResponse(categoriesItIT)
        : jsonResponse(travelImagesResponse);
    };
    const client = makeClient(fetchImpl);

    const categories = await client.getThemeCategories('it-IT');
    const images = await client.getThemeImages('it-IT', 'wild animal');

    expect(urls[0]).toBe(
      'https://services.bingapis.com/ge-apps/api/v2/BWC/GetThemeCategories?mkt=it-IT',
    );
    expect(urls[1]).toBe(
      'https://services.bingapis.com/ge-apps/api/v2/bwc/hpimages?mkt=it-IT&theme=wild%20animal',
    );
    expect(Object.keys(categories)).toHaveLength(11);
    expect(images.images).toHaveLength(3);
    expect(client.getUpstreamStatus()).toBe('ok');
  });

  it('ritenta sui 5xx (max 2 retry) e poi riesce', async () => {
    let attempts = 0;
    const fetchImpl: typeof fetch = async () => {
      attempts += 1;
      return attempts < 3 ? new Response('boom', { status: 503 }) : jsonResponse(categoriesItIT);
    };
    const client = makeClient(fetchImpl);

    await expect(client.getThemeCategories('it-IT')).resolves.toBeTruthy();
    expect(attempts).toBe(3);
    expect(client.getUpstreamStatus()).toBe('ok');
  });

  it('non ritenta sui 4xx e mappa a UPSTREAM_ERROR (502)', async () => {
    let attempts = 0;
    const fetchImpl: typeof fetch = async () => {
      attempts += 1;
      return new Response('nope', { status: 404 });
    };
    const client = makeClient(fetchImpl);

    await expect(client.getThemeCategories('it-IT')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      statusCode: 502,
    });
    expect(attempts).toBe(1);
    expect(client.getUpstreamStatus()).toBe('down');
  });

  it('errori di rete → UPSTREAM_UNAVAILABLE dopo i retry', async () => {
    let attempts = 0;
    const fetchImpl: typeof fetch = async () => {
      attempts += 1;
      throw new Error('ECONNREFUSED');
    };
    const client = makeClient(fetchImpl);

    await expect(client.getThemeCategories('it-IT')).rejects.toMatchObject({
      code: 'UPSTREAM_UNAVAILABLE',
      statusCode: 503,
    });
    expect(attempts).toBe(3);
    expect(client.getUpstreamStatus()).toBe('down');
  });

  it('timeout/abort → UPSTREAM_TIMEOUT (504)', async () => {
    const fetchImpl: typeof fetch = async () => {
      const error = new Error('The operation was aborted');
      error.name = 'TimeoutError';
      throw error;
    };
    const client = makeClient(fetchImpl);

    await expect(client.getThemeImages('it-IT', 'travel')).rejects.toMatchObject({
      code: 'UPSTREAM_TIMEOUT',
      statusCode: 504,
    });
  });

  it('payload non conforme → UPSTREAM_ERROR', async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ images: 'non-un-array' });
    const client = makeClient(fetchImpl);

    await expect(client.getThemeImages('it-IT', 'travel')).rejects.toMatchObject({
      code: 'UPSTREAM_ERROR',
      statusCode: 502,
    });
  });

  it('getUpstreamStatus segue ok → degraded → down nella finestra recente', async () => {
    let down = false;
    const fetchImpl: typeof fetch = async () =>
      down ? new Response('boom', { status: 500 }) : jsonResponse(categoriesItIT);
    const client = makeClient(fetchImpl, { outcomeWindow: 4 });

    await client.getThemeCategories('it-IT');
    expect(client.getUpstreamStatus()).toBe('ok');

    down = true;
    for (let i = 0; i < 4; i += 1) {
      await expect(client.getThemeCategories('it-IT')).rejects.toBeInstanceOf(Error);
      if (i === 0) expect(client.getUpstreamStatus()).toBe('degraded');
    }
    expect(client.getUpstreamStatus()).toBe('down');
  });
});
