import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { clearThemeImagesCache } from './hooks/useThemeImages';
import { t } from './lib/i18n';
import { makeConfig, makeImagesResponse, makeThemesResponse } from './test/fixtures';

/** Risposta JSON minimale: nessuna rete reale nei test. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => body,
  } as unknown as Response;
}

/** Mock di `fetch` che rispetta ESATTAMENTE le rotte di docs/API.md. */
function installFetchMock(): void {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/api/config')) return jsonResponse(makeConfig());
    if (url.startsWith('/api/themes/')) return jsonResponse(makeImagesResponse(4));
    if (url.startsWith('/api/themes')) return jsonResponse(makeThemesResponse());
    return jsonResponse({ error: { code: 'NOT_FOUND', message: 'Risorsa non trovata' } }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
}

describe('App (integrazione con fetch mockato)', () => {
  beforeEach(() => {
    clearThemeImagesCache();
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    installFetchMock();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('skeleton → griglia temi → dettaglio con carosello → lightbox', async () => {
    const user = userEvent.setup();
    render(<App />);

    // 1. Skeleton durante il primo caricamento (config + temi).
    expect(screen.getByText(t.loading)).toBeInTheDocument();

    // 2. Griglia temi popolata dal contratto.
    const card = await screen.findByRole('link', { name: t.openTheme('Viaggi') });
    expect(screen.getByRole('heading', { name: t.galleryTitle })).toBeInTheDocument();
    expect(screen.getByText(t.imageCount(4))).toBeInTheDocument();

    // 3. Click sulla card → dettaglio tema con carosello.
    await user.click(card);
    expect(await screen.findByRole('region', { name: t.carouselLabel })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'Panorama 1' })).toBeInTheDocument();
    expect(screen.getByText(t.imagePosition(1, 4))).toBeInTheDocument();

    // 4. Apertura del lightbox.
    await user.click(screen.getByRole('button', { name: t.openLightbox }));
    expect(await screen.findByRole('dialog', { name: t.lightboxLabel })).toBeInTheDocument();
    expect(screen.getByText(t.imageCounter(1, 4))).toBeInTheDocument();
  });

  it('il deep-link #/tema/travel/3 apre il tema e la lightbox sulla quarta immagine', async () => {
    window.history.replaceState(null, '', '/#/tema/travel/3?mkt=it-IT');
    render(<App />);

    expect(await screen.findByRole('dialog', { name: t.lightboxLabel })).toBeInTheDocument();
    expect(screen.getByText(t.imageCounter(4, 4))).toBeInTheDocument();
    expect(screen.getAllByRole('img', { name: 'Panorama 4' })).toHaveLength(2);
  });

  it('mostra lo stato di errore con "Riprova" se la configurazione fallisce', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { code: 'UPSTREAM_UNAVAILABLE', message: 'Bing non raggiungibile' } }, 503)),
    );

    render(<App />);

    expect(await screen.findByText(t.errorConfig)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.retry })).toBeInTheDocument();
  });
});
