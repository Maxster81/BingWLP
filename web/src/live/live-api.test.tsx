/**
 * Test di integrazione "live": renderizza l'app vera contro un backend reale (nessun mock).
 *
 * È OPT-IN: viene eseguito solo se la variabile d'ambiente `LIVE_API_URL` punta a un backend
 * in esecuzione, altrimenti l'intera suite viene saltata (così `npm test` resta offline).
 *
 *   npm run build && PORT=8099 node server/dist/index.js &
 *   LIVE_API_URL=http://127.0.0.1:8099 npm run test --workspace web
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { t } from '../lib/i18n';

const LIVE_API_URL = process.env.LIVE_API_URL;
const describeLive = LIVE_API_URL ? describe : describe.skip;

describeLive('integrazione con il backend reale (LIVE_API_URL)', () => {
  const realFetch = globalThis.fetch;

  beforeAll(() => {
    // Gli URL del client sono relativi (`/api/...`): li risolviamo sul backend live.
    // Nota: il signal viene scartato perché jsdom fornisce AbortSignal non compatibili con
    // l'implementazione fetch di Node (undici). In questo test live l'abort non è rilevante.
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const { signal: _signal, ...rest } = init ?? {};
      return realFetch(new URL(String(input), LIVE_API_URL), rest);
    }) as typeof fetch;
    window.location.hash = '';
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it(
    'carica i temi reali, apre un tema, naviga il carosello e apre il lightbox',
    async () => {
      const user = userEvent.setup();
      render(<App />);

      // 1. Griglia temi con dati reali di Bing (market di default).
      await screen.findByText(t.galleryTitle, undefined, { timeout: 30_000 });
      const travelCard = await screen.findByRole('link', { name: t.openTheme('Viaggi') }, { timeout: 30_000 });
      expect(screen.getByRole('link', { name: t.openTheme('Gatto') })).toBeInTheDocument();

      // 2. Apertura del tema "Viaggi" → dettaglio con carosello.
      await user.click(travelCard);

      const carousel = await screen.findByRole('region', { name: t.carouselLabel }, { timeout: 30_000 });
      await waitFor(
        () => {
          expect(within(carousel).getByText('Golden Gate Highlands National Park, South Africa')).toBeInTheDocument();
        },
        { timeout: 30_000 },
      );

      // 3. Navigazione del carosello → cambia l'immagine mostrata.
      const nextButton = within(carousel).getByRole('button', { name: t.nextImage });
      await user.click(nextButton);
      await waitFor(() => {
        expect(within(carousel).getByText('Umhlanga pier, Durban, South Africa')).toBeInTheDocument();
      });
      expect(screen.getByText(t.imagePosition(2, 8))).toBeInTheDocument();

      // 4. Fullscreen (lightbox) sulla seconda immagine.
      await user.click(screen.getByRole('button', { name: t.openLightbox }));
      const dialog = await screen.findByRole('dialog', { name: t.lightboxLabel });
      expect(dialog).toBeInTheDocument();
      expect(screen.getByText(t.imageCounter(2, 8))).toBeInTheDocument();

      // 5. Chiusura con ESC.
      await user.keyboard('{Escape}');
      await waitFor(() => {
        expect(screen.queryByRole('dialog', { name: t.lightboxLabel })).not.toBeInTheDocument();
      });
    },
    120_000,
  );

  it(
    'le immagini sono servite dal backend (302 al CDN) e il download è un file JPEG',
    async () => {
      const imagesResponse = await fetch('/api/themes/travel/images?mkt=it-IT');
      expect(imagesResponse.status).toBe(200);
      const payload = (await imagesResponse.json()) as {
        count: number;
        images: { title: string; urls: { full: string; thumb: string }; downloadBase: string }[];
      };
      expect(payload.count).toBe(8);

      const first = payload.images[0];
      expect(first).toBeDefined();
      if (!first) throw new Error('nessuna immagine nel tema travel');

      // `/api/image` → 302 verso il CDN Bing con i parametri di ridimensionamento.
      const redirect = await fetch(first.urls.full, { redirect: 'manual' });
      expect(redirect.status).toBe(302);
      const location = redirect.headers.get('location') ?? '';
      expect(location).toContain('https://www.bing.com/th?id=');

      const bytes = await fetch(first.urls.thumb, { redirect: 'follow' });
      expect(bytes.status).toBe(200);
      expect(bytes.headers.get('content-type')).toContain('image/jpeg');
      const buffer = await bytes.arrayBuffer();
      expect(buffer.byteLength).toBeGreaterThan(10_000);

      // Download: attachment con nome file e dimensioni richieste.
      const download = await fetch(`${first.downloadBase}&res=1920x1080`);
      expect(download.status).toBe(200);
      expect(download.headers.get('content-type')).toContain('image/jpeg');
      expect(download.headers.get('content-disposition')).toContain('attachment');
      expect(download.headers.get('content-disposition')).toContain('1920x1080.jpg');
      expect((await download.arrayBuffer()).byteLength).toBeGreaterThan(50_000);

      // Risoluzione non valida → 400 con codice di errore del contratto.
      const bad = await fetch(`${first.downloadBase}&res=9999x9999`);
      expect(bad.status).toBe(400);
      const error = (await bad.json()) as { error?: { code?: string } };
      expect(error.error?.code).toBe('BAD_REQUEST');
    },
    120_000,
  );
});
