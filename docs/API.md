# BingWLP — Contratto API (frozen v1)

> **Questo documento è il contratto congelato tra backend e frontend.**
> Ogni modifica va concordata: backend e frontend devono restare allineati.

Tutte le rotte sono servite dal backend Node (`server/`) sotto il prefisso `/api`.
In produzione nginx espone il tutto su `https://<host>/` (statico) e `/api/*` (proxy → Node).
Il frontend usa sempre URL **relativi** (`/api/...`), mai URL assoluti o CORS.

- Formato: JSON UTF-8, `Content-Type: application/json`.
- Sorgente dati upstream (Bing):
  - categorie: `GET https://services.bingapis.com/ge-apps/api/v2/BWC/GetThemeCategories?mkt=<mkt>`
  - immagini: `GET https://services.bingapis.com/ge-apps/api/v2/bwc/hpimages?mkt=<mkt>&theme=<key>`
  - CDN immagini: `GET https://www.bing.com/th?id=<id>&w=<w>&h=<h>&qlt=<qlt>`
- La risoluzione è gestita dal CDN di Bing: `w`/`h` restituiscono **esattamente** quelle dimensioni
  (crop/resize lato Bing), fino alla dimensione nativa dell'immagine (oltre la nativa non si sale).
  `qlt` (default 80) alza la qualità JPEG; `qlt=100` ≈ originale.

## Tipi condivisi

```ts
type MarketCode = string;            // es. "it-IT"  (formato ^[a-z]{2}-[A-Z]{2}$)
type ThemeKey = string;              // es. "travel", "wild animal", "animated" (case-sensitive!)
type ThemeType = "Regular" | "ThemePack";

type Theme = {
  key: ThemeKey;                     // chiave da passare come ?theme=
  name: string;                      // nome localizzato dal market (es. "Viaggi")
  type: ThemeType;
  isNew: boolean;                    // badge "Novità"
  imageCount: number | null;         // null se upstream non raggiungibile in quel momento
  coverUrl: string | null;           // URL relativo /api/image?... (card 800x450) oppure null
};

type WallpaperImage = {
  index: number;                     // 0-based, indice stabile nell'ordine upstream
  id: string;                        // id immagine Bing, es. "OBGA.Lock2017-B5_..."
  title: string;                     // titolo leggibile
  description: string;               // descrizione lunga (può essere vuota)
  headline: string;
  copyright: string;                 // es. "© /Shutterstock"
  copyrightUrl: string | null;       // link Bing di credito/ricerca
  searchUrl: string | null;          // "scopri di più"
  startDate: string;                 // es. "Travel_132"
  themes: string[];
  sourceType: string;                // es. "StockImage"
  /** presente solo per temi animati (mp4 di Microsoft) */
  animated: { name: string; posterUrl: string; videoUrl: string } | null;
  /** URL relativi pronti all'uso (usano il proxy/redirect del backend) */
  urls: {
    thumb: string;                   // 480x270
    card: string;                    // 800x450
    preview: string;                 // 1280x720
    full: string;                    // 1920x1080
    original: string;                // dimensione nativa
  };
  /** base per il download; aggiungere &res=<ResolutionKey> */
  downloadBase: string;              // /api/download?mkt=..&theme=..&i=<index>
};

type Resolution = {
  key: string;                       // "1920x1080" | "original"
  label: string;                     // etichetta IT pronta da mostrare
  group: "original" | "desktop" | "ultrawide" | "mobile" | "tablet";
  width: number;                     // 0 = nativa
  height: number;                    // 0 = nativa
  aspect: string;                    // "16:9" | "nativa" | ...
  recommended?: boolean;
};
```

## Errori

Tutte le risposte di errore hanno forma:

```json
{ "error": { "code": "BAD_REQUEST", "message": "messaggio leggibile" } }
```

| HTTP | code | quando |
| ---- | ---- | ------ |
| 400 | `BAD_REQUEST` | parametri mancanti/invalidi (mkt, theme, i, w/h, res) |
| 404 | `NOT_FOUND` | rotta inesistente |
| 404 | `THEME_NOT_FOUND` | tema inesistente per quel market |
| 404 | `IMAGE_NOT_FOUND` | indice immagine fuori range per quel tema |
| 429 | `RATE_LIMITED` | rate limit superato |
| 502 | `UPSTREAM_ERROR` | Bing ha risposto con errore |
| 504 | `UPSTREAM_TIMEOUT` | timeout verso Bing |
| 503 | `UPSTREAM_UNAVAILABLE` | Bing irraggiungibile e nessuna cache disponibile |

Se esiste una risposta in cache **scaduta**, il backend la serve comunque e imposta
`"stale": true` (graceful degradation) invece di restituire 5xx.


---

## 1. `GET /api/health`

`200`

```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptimeSec": 1234,
  "upstream": "ok",
  "cache": { "themes": 11, "images": 11, "entries": 22 },
  "timestamp": "2026-01-01T10:00:00.000Z"
}
```

## 2. `GET /api/config`

Configurazione statica per il frontend (una chiamata all'avvio).

`200`

```json
{
  "defaultMarket": "it-IT",
  "markets": [ { "code": "it-IT", "name": "Italiano (Italia)", "flag": "🇮🇹" } ],
  "resolutions": [ { "key": "1920x1080", "label": "Full HD 16:9 · 1920×1080", "group": "desktop", "width": 1920, "height": 1080, "aspect": "16:9", "recommended": true } ],
  "defaultResolution": "1920x1080",
  "limits": { "maxWidth": 8000, "maxHeight": 8000 },
  "cacheTtlSec": { "themes": 21600, "images": 3600 }
}
```

## 3. `GET /api/themes?mkt=it-IT`

Elenco temi per il market (con conteggio immagini e cover).

Query:
- `mkt` (opzionale, default da env `DEFAULT_MARKET`, es. `it-IT`)
- `include=images` (opzionale): include anche l'array `images` completo per ogni tema
- `refresh=1` (opzionale): forza il refresh della cache

`200`

```json
{
  "market": "it-IT",
  "fetchedAt": "2026-01-01T10:00:00.000Z",
  "stale": false,
  "count": 11,
  "themes": [
    {
      "key": "travel",
      "name": "Viaggi",
      "type": "Regular",
      "isNew": false,
      "imageCount": 8,
      "coverUrl": "/api/image?mkt=it-IT&theme=travel&i=0&w=800&h=450"
    }
  ]
}
```

> `coverUrl` può essere `null` se per quel tema non sono disponibili immagini:
> il frontend mostra un placeholder grafico (gradiente + nome tema).

## 4. `GET /api/themes/{key}/images?mkt=it-IT`

Immagini di un tema (il carosello). Query: `mkt` (opzionale), `refresh=1` (opzionale).

`200`

```json
{
  "market": "it-IT",
  "fetchedAt": "2026-01-01T10:00:00.000Z",
  "stale": false,
  "theme": { "key": "travel", "name": "Viaggi", "type": "Regular", "isNew": false },
  "count": 8,
  "images": [ { "index": 0, "id": "OBGA.Lock2017-B5_...", "title": "...", "urls": { "thumb": "...", "card": "...", "preview": "...", "full": "...", "original": "..." }, "downloadBase": "..." } ]
}
```

`404 THEME_NOT_FOUND` se `key` non esiste nel market richiesto.
Se il tema esiste ma non ha immagini → `200` con `count: 0` e `images: []`.

## 5. `GET /api/image`

Serve l'immagine (thumbnail / anteprima / fullscreen / originale).

Query obbligatori: `theme`, `i` (indice 0-based).
Query opzionali:
- `mkt` (default da env)
- `w`, `h` (pixel target; se omessi → dimensione nativa). Limiti: 16..8000, validati.
- `qlt` (1..100, default 80)
- `mode=redirect|stream` (default `redirect`): `redirect` → `302` verso il CDN Bing;
  `stream` → il backend fa da proxy e restituisce i byte (fallback se il CDN blocca hotlink).
- `dl=1`: forza il download (`Content-Disposition: attachment`).

Risposte: `302` con `Location` al CDN (default) oppure `200` con `Content-Type: image/jpeg`
e `Cache-Control: public, max-age=2592000, immutable`.

## 6. `GET /api/download`

Scarica il file con nome sensato (proxy streaming, supporta `Range`).

Query obbligatori: `theme`, `i`, **`res`** (`ResolutionKey`: es. `1920x1080`, `3840x2160`, `original`).
Query opzionali: `mkt`, `qlt`.

`200` → `Content-Type: image/jpeg`,
`Content-Disposition: attachment; filename="bing-wallpaper_<theme>_<slug>_<res>.jpg"`.

## 7. `GET /api/resolutions`

`200` → `{ "default": "1920x1080", "resolutions": [Resolution, ...] }`

---

## Archiviazione delle immagini (prevista, NON implementata)

Il backend espone un'interfaccia `ImageStore` (`server/src/store/`):

```ts
interface ImageStore {
  readonly kind: "null" | "fs";
  isEnabled(): boolean;
  /** Ritorna il path pubblico locale di un'immagine se archiviata, altrimenti null. */
  locate(descriptor: ImageDescriptor, res: string): Promise<string | null>;
  /** Archivia i byte (best-effort). */
  persist(descriptor: ImageDescriptor, res: string, bytes: Buffer, meta: ImageMeta): Promise<void>;
}
```

- Implementazione attiva di default: `NullImageStore` (no-op) → `/api/image` fa redirect al CDN.
- È fornito uno scheletro `FsImageStore` **non attivo** (documentato, non abilitato) per il futuro
  storico dei wallpaper (`IMAGE_STORE=null|fs`). Nessuno store è implementato in questa iterazione.

## Variabili d'ambiente (backend)

| Variabile | Default | Descrizione |
| --------- | ------- | ----------- |
| `HOST` | `0.0.0.0` | bind address |
| `PORT` | `8080` | porta HTTP |
| `DEFAULT_MARKET` | `it-IT` | market di default |
| `BING_API_BASE` | `https://services.bingapis.com/ge-apps/api/v2` | base API Bing |
| `BING_CDN_BASE` | `https://www.bing.com/th` | base CDN immagini |
| `CACHE_TTL_THEMES_SEC` | `21600` | TTL cache categorie/temi |
| `CACHE_TTL_IMAGES_SEC` | `3600` | TTL cache immagini per tema |
| `UPSTREAM_TIMEOUT_MS` | `8000` | timeout verso Bing |
| `SERVE_STATIC` | `true` | serve il build del frontend |
| `STATIC_DIR` | `../web/dist` | cartella build frontend |
| `IMAGE_STORE` | `null` | `null` \| `fs` (fs non implementato) |
| `IMAGE_STORE_DIR` | `./data/images` | cartella store (futuro) |
| `ALLOW_ORIGINS` | `` (vuoto = same-origin) | CORS extra, opzionale |
| `RATE_LIMIT_MAX` | `0` (off) | richieste/minuto per IP |
| `LOG_LEVEL` | `info` | livello log pino |

Vedi anche [`ARCHITECTURE.md`](./ARCHITECTURE.md) e [`DEPLOY.md`](./DEPLOY.md).
