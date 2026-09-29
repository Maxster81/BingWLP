# BingWLP — Bing Wallpaper Gallery

Replica web dell'app **Bing Wallpaper** di Windows: sfoglia i temi messi a disposizione da Bing,
guarda le immagini in un carosello, aprìle a schermo intero e scaricale nella risoluzione che ti serve.

> Applicazione full-stack (backend Node/Fastify + frontend React/Vite) pensata per essere deployata su
> **Ubuntu** con nginx + systemd oppure Docker.

## Funzionalità

| Area | Cosa fa |
| ---- | ------- |
| **Temi** | Legge le categorie reali da Bing (`GetThemeCategories`) con i nomi **localizzati per market** (`it-IT`, `en-US`, …), badge "Novità" e "Pacchetto". |
| **Market** | Selettore di ~30 market: cambiando market cambiano i nomi dei temi e i contenuti. Scelta persistita in locale e presente nell'URL (condivisibile). |
| **Carosello** | Immagini del tema con miniature, frecce, navigazione da tastiera, swipe su mobile e slideshow automatico opzionale. |
| **Schermo intero** | Lightbox con sfondo sfocato, zoom, contatore, crediti/autore e deep-link (`#/tema/travel/3` apre direttamente la quarta immagine). |
| **Download** | Qualsiasi risoluzione gestita dal CDN di Bing (nativa, 5K, 4K, QHD, Full HD, 16:10, ultrawide, tablet, smartphone) con nome file sensato. |
| **Metadati** | Titolo, descrizione, credito (`© /Shutterstock`), link "Scopri di più" verso Bing. |
| **Temi animati** | Per i pacchetti animati di Bing sono esposti anche i poster e i video MP4 originali. |
| **Resilienza** | Cache in-memory con TTL e fallback sui dati scaduti (`stale: true`) quando Bing è lento o giù: il sito continua a rispondere. |
| **Accessibilità** | Ruoli/aria, navigazione completa da tastiera, focus trap nel lightbox, `prefers-reduced-motion`. |

## Come funziona (in breve)

```
Browser ──▶ nginx ──▶ React (statico, web/dist)
                └──▶ /api/* ──▶ Node/Fastify ──▶ services.bingapis.com  (categorie + immagini)
                                      └────────▶ www.bing.com/th       (JPEG ridimensionati a richiesta)
```

- Il **backend è l'unico** che parla con Bing: niente CORS nel browser, URL upstream centralizzati e
  cache in-memory (categorie 6h, immagini 1h) con degradazione elegante.
- Le immagini di griglia/carosello sono servite da `/api/image`, che oggi risponde con un **redirect 302**
  al CDN di Bing (banda zero sul server, cache CDN). Il redirect è voluto: quando in futuro si abiliterà
  uno store locale delle immagini, lo stesso endpoint servirà i byte locali **senza cambiare il frontend**.
- I **download** passano dal backend (`/api/download`) per avere `Content-Disposition` con un nome file
  decente e per non dipendere da hotlink/referrer.

Dettagli completi: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e il contratto HTTP in [`docs/API.md`](docs/API.md).

## Stack

- **Backend**: Node.js 20+, Fastify 5, TypeScript (ESM), zod, pino — cache in-memory, nessun database.
- **Frontend**: React 18 + Vite 5 + TypeScript + CSS puro (nessuna libreria UI: bundle leggero).
- **Deploy**: nginx (statico + reverse proxy) + systemd su Ubuntu, oppure Docker/Compose.
- **Test**: Vitest (backend: nessuna rete reale, client Bing iniettato; frontend: Testing Library).

## Avvio rapido (sviluppo)

Requisiti: Node 20+ (vedi `.nvmrc`) e npm.

```bash
git clone https://github.com/Maxster81/BingWLP.git
cd BingWLP
npm ci

# avvia backend (8080) e frontend in dev (5173, proxy /api -> 8080)
npm run dev
# -> http://localhost:5173
```

Comandi utili:

```bash
npm run dev:server                 # solo backend (tsx watch)
npm run dev:web                    # solo frontend (vite)
npm run typecheck                  # TypeScript su server + web
npm test                           # test backend + frontend
npm run build                      # build di produzione: web/dist + server/dist
npm start                          # avvia il backend (serve anche web/dist se SERVE_STATIC=true)
```

Se il frontend in dev non è collegato al backend, la pagina mostra gli stati di caricamento/errore
con il pulsante "Riprova".

## Test

```bash
npm test        # 161 test (90 backend + 71 frontend), nessuna rete richiesta
```

Il backend viene testato con un client Bing **finto e iniettato** (`buildApp`): i test non toccano la
rete e girano anche offline. C'è anche un test di integrazione **live** (opt-in) che renderizza l'app
vera contro un backend reale ed esercita griglia → carosello → lightbox e il percorso di download:

```bash
npm run build
PORT=8099 SERVE_STATIC=true node server/dist/index.js &
LIVE_API_URL=http://127.0.0.1:8099 npm run test --workspace web
```

Senza `LIVE_API_URL` quel test viene saltato automaticamente.


## Configurazione

Il backend legge le variabili d'ambiente (nessun file obbligatorio in sviluppo):

```bash
cp server/.env.example server/.env   # riferimento dei nomi/valori
```

| Variabile | Default | Note |
| --------- | ------- | ---- |
| `PORT` / `HOST` | `8080` / `0.0.0.0` | in produzione `127.0.0.1` dietro nginx |
| `DEFAULT_MARKET` | `it-IT` | market iniziale |
| `CACHE_TTL_THEMES_SEC` | `21600` | TTL cache categorie |
| `CACHE_TTL_IMAGES_SEC` | `3600` | TTL cache immagini per tema |
| `SERVE_STATIC` / `STATIC_DIR` | `true` / `../web/dist` | `false` quando nginx serve lo statico |
| `IMAGE_STORE` | `null` | storico immagini: **previsto, non implementato** |

Tabella completa in [`docs/API.md`](docs/API.md).

## Deploy su Ubuntu

Guida completa, passo-passo e copia-incollabile: **[`docs/DEPLOY.md`](docs/DEPLOY.md)**.

In sintesi:

```bash
sudo bash scripts/install-ubuntu.sh            # utente di sistema, Node 20, nginx, systemd
sudo editor /etc/bingwlp/bingwlp.env           # configurazione
sudo bash scripts/deploy.sh                    # build + statico + restart + healthcheck
sudo certbot --nginx -d wallpaper.example.com  # HTTPS
```

Artefatti pronti in [`deploy/`](deploy): `nginx/bingwlp.conf`, `systemd/bingwlp.service`,
`Dockerfile`, `docker-compose.yml`, `logrotate/bingwlp`, `bingwlp.env.example`.

La CI GitHub Actions è in `deploy/github-workflows/ci.yml`: copiala in `.github/workflows/ci.yml`
(il token usato per questo branch non ha il permesso `workflows` per crearla da solo).

## Struttura del progetto

```
server/   backend Fastify (API, cache, client Bing, store immagini astratto)
web/      frontend React + Vite (componenti, hook, design system CSS)
deploy/   nginx, systemd, Docker, logrotate, env di esempio
docs/     API.md (contratto), ARCHITECTURE.md, DEPLOY.md
scripts/  install-ubuntu.sh, deploy.sh
```

## API

Endpoints esposti dal backend (dettaglio in [`docs/API.md`](docs/API.md)):

| Metodo | Rotta | Descrizione |
| ------ | ----- | ----------- |
| `GET` | `/api/health` | stato servizio e upstream (healthcheck/uptime) |
| `GET` | `/api/config` | market supportati, risoluzioni disponibili, limiti |
| `GET` | `/api/resolutions` | preset di risoluzione |
| `GET` | `/api/themes?mkt=it-IT` | temi con conteggio immagini e cover |
| `GET` | `/api/themes/:key/images?mkt=it-IT` | immagini di un tema |
| `GET` | `/api/image?theme=travel&i=0&w=1920&h=1080` | immagine (302 al CDN, o stream) |
| `GET` | `/api/download?theme=travel&i=0&res=3840x2160` | download come file `.jpg` |

## Roadmap

- [ ] **Store locale delle immagini** (storico dei wallpaper più vecchi): l'astrazione `ImageStore`
      e lo scheletro `FsImageStore` esistono già, l'implementazione no (`IMAGE_STORE=fs` non attivo).
- [ ] Preferiti e collezioni locali.
- [ ] PWA/offline con cache delle immagini scelte.
- [ ] Sincronizzazione con lo *slideshow* del desktop tramite cartella condivisa.

## Note legali

Le immagini, i titoli e i metadati sono di proprietà di **Microsoft/Bing** e dei rispettivi autori
(i crediti sono mostrati nell'interfaccia accanto a ogni immagine). Questo progetto è un visualizzatore
non ufficiale che inoltra le API pubbliche di Bing: nessun contenuto viene ridistribuito o riscritto,
le immagini sono servite direttamente dai CDN di Bing. Usalo a livello personale e rispetta i termini
d'uso dei servizi Bing; per usi commerciali verifica le licenze delle singole immagini.

## Licenza

Codice distribuito con licenza **MIT**. I contenuti multimediali restano dei rispettivi proprietari.
