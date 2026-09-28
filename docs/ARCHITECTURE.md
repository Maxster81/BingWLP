# Architettura — BingWLP

Replica web dell'app **Bing Wallpaper** di Windows: esplora i temi di Bing, sfoglia le
immagini in carosello, apri a schermo intero e scarica in diverse risoluzioni.

## Stack e motivazioni

| Livello | Scelta | Perché |
| ------- | ------ | ------ |
| Backend | **Node.js 20 + Fastify 5 + TypeScript** | Fast, schema-first, ottimo per proxy HTTP e caching in-memory; stesso linguaggio del frontend. |
| Frontend | **React 18 + Vite 5 + TypeScript + CSS puro** | SPA snella per una galleria immagini; zero dipendenze UI pesanti = bundle piccolo e immagini a schermo prima. |
| Caching | **In-memory TTL + stale-while-error** | Le API Bing sono lente e rate-limited: la cache rende il sito reattivo e resiliente. |
| DB | **Nessuno (previsto, non implementato)** | Nessun dato persistente necessario; lo storico immagini è delegato a un'astrazione `ImageStore` non attiva. |
| Deploy | **nginx + systemd su Ubuntu** (o Docker) | Un solo processo Node + nginx che serve statico/immagini e fa da reverse proxy con cache. |

Il backend è l'unico che parla con Bing (evita CORS, nasconde gli URL upstream, centralizza cache e
rate-limit) e il frontend usa solo URL relativi `/api/...`.

## Flusso dati

```
Browser ──GET /──▶ nginx ──▶ web/dist (statico)
Browser ──GET /api/themes?mkt=it-IT──▶ nginx ──▶ Node/Fastify
                                                   │  cache hit? ─▶ risposta (stale: false|true)
                                                   └─ miss ─▶ services.bingapis.com/... ─▶ normalizza
Browser ──GET /api/image?theme=travel&i=0&w=800&h=450──▶ nginx ──▶ Node ──302──▶ www.bing.com/th?id=...
Browser ──GET /api/download?theme=travel&i=0&res=3840x2160──▶ nginx ──▶ Node ──stream──▶ .jpg
```

- Le **immagini di griglia/carosello** passano dal `302` verso il CDN Bing (nessuna banda sul server,
  cache nginx/CDN). Il `302` è deliberato: quando in futuro si abiliterà uno store locale,
  l'endpoint servirà i byte locali **senza cambiare gli URL lato client**.
- I **download** sono streammati dal backend per garantire `Content-Disposition` con un nome file
  decente (`bing-wallpaper_<tema>_<slug>_<risoluzione>.jpg`) e indipendenza da hotlink/referrer.

## Sorgente dati Bing (verificata)

1. `GET /BWC/GetThemeCategories?mkt=it-IT` → mappa `{ "<themeKey>": { Name, Type, IsNew, Images[] } }`.
   - `themeKey` è ciò che va passato come `?theme=` (case-sensitive, può contenere spazi: `"wild animal"`).
   - `Type`: `Regular` | `ThemePack`; `IsNew`: badge "Novità".
2. `GET /bwc/hpimages?mkt=it-IT&theme=<key>` → `{ images: [...], imageCount }` con, per immagine:
   `urlbase` (id immagine, es. `https://www.bing.com/th?id=OBGA.Xyz`), `title`, `description`,
   `headline`, `copyrighttext`, `copyrightlink`, `startdate`, `theme[]`, `sourceType`,
   `imageHotspots[]` (scartati: rumore), `topRightCTAData.SearchUrls[0]` ("scopri di più"),
   e per i temi animati `AnimatedWP.Assets[0].Url` (video MP4 su download.microsoft.com).
3. Immagini: `https://www.bing.com/th?id=<id>&w=<w>&h=<h>&qlt=<qlt>` → JPEG esattamente `w×h`
   (crop/scale lato Bing), fino alla dimensione nativa (verificati 4860×3240 e 7819×5212).
   Senza `w`/`h` → nativa. `qlt=100` ≈ qualità originale.


## Struttura del repository

```
.
├── server/                 # backend Fastify (TypeScript, ESM)
│   ├── src/
│   │   ├── index.ts        # bootstrap (env, listen, graceful shutdown)
│   │   ├── app.ts          # buildApp({deps}) → Fastify instance (testabile)
│   │   ├── config.ts       # env → Config tipizzata (zod)
│   │   ├── logger.ts       # pino config
│   │   ├── errors.ts       # AppError + codice/mappatura HTTP
│   │   ├── bing/
│   │   │   ├── types.ts    # tipi del JSON upstream (grezzi)
│   │   │   ├── client.ts   # HTTP verso Bing (timeout, retry, esiti per /health)
│   │   │   └── mappers.ts  # upstream → dominio (funzioni pure)
│   │   ├── domain/
│   │   │   ├── types.ts        # tipi del contratto (docs/API.md)
│   │   │   ├── markets.ts      # market supportati + etichette
│   │   │   └── resolutions.ts  # preset di risoluzione
│   │   ├── cache/ttl-cache.ts  # TTL cache con fallback stale
│   │   ├── store/
│   │   │   ├── types.ts        # ImageStore (contratto futuro)
│   │   │   ├── null-store.ts   # implementazione attiva (no-op)
│   │   │   └── fs-store.ts     # scheletro NON attivo (storico immagini)
│   │   ├── services/gallery.ts # orchestrazione: cache + bing + mapping
│   │   └── routes/             # health, config, themes, images, download
│   └── test/                   # vitest (nessuna rete reale: fake client)
├── web/                    # frontend React + Vite
│   ├── src/
│   │   ├── main.tsx, App.tsx
│   │   ├── api/            # client tipizzato + tipi del contratto
│   │   ├── hooks/          # useConfig, useThemes, useThemeImages, useHashRoute, ...
│   │   ├── components/     # UI (prefisso classi `bwp-`)
│   │   ├── lib/            # urls, format, i18n, router
│   │   └── styles/         # tokens.css, base.css (+ CSS per componente)
│   └── public/
├── deploy/                 # Dockerfile, compose, nginx, systemd, logrotate, env di esempio
├── docs/                   # API.md (contratto), ARCHITECTURE.md, DEPLOY.md
├── scripts/                # install-ubuntu.sh, deploy.sh
└── .github/workflows/      # CI
```

## Convenzioni di codice

- TypeScript `strict` (+ `noUncheckedIndexedAccess`), **niente `any`**: input esterni validati con zod.
- ESM puro; import interni **senza estensione `.js`** (risoluzione `bundler`, build con `tsup`/`vite`).
- Backend: dipendenze iniettate (`buildApp`), test con `fastify.inject()` e client Bing finto → **nessuna
  chiamata di rete nei test**.
- Frontend: **nessuna dipendenza runtime extra** oltre React; CSS puro con classi prefissate `bwp-`;
  stato globale minimo (niente Redux); accessibilità (ruoli/aria, navigazione da tastiera, focus trap nel lightbox).
- Stringhe UI in **italiano** in un unico dizionario (`web/src/lib/i18n.ts`).
- Il contratto in `docs/API.md` è vincolante: se serve cambiarlo, va aggiornato anche il documento.
