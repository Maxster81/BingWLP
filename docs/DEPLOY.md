# Deploy di BingWLP su Ubuntu

Guida operativa, copia-incollabile, per mettere in produzione **BingWLP** (backend
Node/Fastify + frontend React/Vite) su un server **Ubuntu LTS** pulito
(testata su 22.04, 24.04 e 26.04; la procedura è generica e vale per qualunque Ubuntu LTS recente).

Due strade possibili:

| Strada | Quando usarla | Cosa serve |
| ------ | ------------- | ---------- |
| **A. nginx + systemd** (consigliata) | VPS "normale", controllo totale su TLS, cache, gzip e log | Ubuntu, sudo, dominio |
| **B. Docker Compose** | host già "dockerizzato", isolamento e immagine immutabile | Docker + plugin compose |

Tutto ciò che viene citato vive nel repository:

```
deploy/
├── bingwlp.env.example          # modello di /etc/bingwlp/bingwlp.env
├── Dockerfile                   # immagine multi-stage (node:20-alpine)
├── docker-compose.yml           # stack docker (profilo reverse proxy opzionale)
├── logrotate/bingwlp            # rotazione log (modalità file)
├── nginx/bingwlp.conf           # server block nginx (statico + proxy /api)
└── systemd/
    ├── bingwlp.service          # unit di servizio (hardening)
    └── bingwlp.service.d/10-release.conf   # drop-in per il deploy atomico
scripts/
├── install-ubuntu.sh            # setup del server (idempotente)
├── deploy.sh                    # deploy atomico + healthcheck + rollback
└── backup-images.sh             # backup dello store immagini (futuro)
```

---

## 1. Architettura di deploy

### 1.1 Strada A — nginx + systemd

```
                          INTERNET
                              │
                              │  https://wallpaper.example.com
                              ▼
       ┌──────────────────────────────────────────────┐
       │  nginx :80 / :443   (TLS gestito da certbot) │
       │  server_tokens off, gzip, header sicurezza   │
       └───────┬───────────────────────────┬──────────┘
               │                           │
   /  → statici│                           │ /api/* → proxy_pass
    (web/dist) │                           │
               ▼                           ▼
   ┌───────────────────────┐   ┌─────────────────────────────┐
   │ /var/www/bingwlp/web  │   │ 127.0.0.1:8080  Node/Fastify│
   │   /dist  (symlink)    │   │ systemd unit: bingwlp       │
   │ assets/*hash → 1y     │   │ utente: bingwlp (non root)  │
   │ index.html  → no-cache│   │ ProtectSystem=strict        │
   └───────────────────────┘   └──────────┬──────────────────┘
               ▲                          │
               │                          │ 302 / stream
               │                          ▼
               │               ┌──────────────────────────────┐
               │               │ www.bing.com/th  (CDN Bing)  │
               │               │ services.bingapis.com        │
               │               └──────────────────────────────┘
               │
      /opt/bingwlp/current ──► /opt/bingwlp/releases/<ts>-<sha>/
                                 (node_modules + server/dist + web/dist)
```

Punti chiave:

- **Un solo processo Node** (Fastify) dietro nginx, in ascolto su `127.0.0.1:8080`
  (mai esposto pubblicamente).
- **Il frontend è statico**: nginx serve `web/dist` direttamente. Il backend gira con
  `SERVE_STATIC=false` (vedi § 1.3).
- **Le immagini non pesano sul server**: `/api/image` risponde `302` verso il CDN di
  Bing, quindi il browser scarica i byte direttamente da `www.bing.com`. Solo
  `/api/download` è streammato dal backend, per garantire il `Content-Disposition`
  con un nome file decente.

### 1.2 Strada B — Docker

```
 INTERNET ─▶ (nginx/caddy, profilo `proxy`) ─▶ container bingwlp:8080
                                               │
                              Fastify + SERVE_STATIC=true
                              serve /app/web/dist (API + SPA dallo stesso processo)
```

In Docker **non c'è nginx**, quindi il backend fa anche da web server statico:
`SERVE_STATIC=true` e `STATIC_DIR=/app/web/dist`.

### 1.3 Perché nginx serve il frontend (e le alternative)

Il backend **può** servire il build del frontend: con `SERVE_STATIC=true` e
`STATIC_DIR=<cartella>` registra `@fastify/static` su `/` e fa anche da SPA fallback.
Qui la scelta è **`SERVE_STATIC=false`**, con nginx che serve `web/dist`:

| Aspetto | nginx statico | backend statico (`SERVE_STATIC=true`) |
| ------- | ------------- | ------------------------------------- |
| gzip | nativo, ottimizzato | compressione in JS dentro il processo Node |
| cache (`etag`, `max-age`) | regole per path, `immutable` sugli asset con hash | header generici |
| TLS / header sicurezza / rate limit | in un unico posto (nginx) | divisi tra nginx e app |
| file descriptor e CPU di Node | liberi per l'API | occupati anche a servire asset |
| hop per una richiesta di asset | 1 | 2 (nginx → Node → file) |

**Alternativa A1 — backend statico, nginx solo proxy.** Se preferite un solo "posto"
da deployare: nel file env mettete `SERVE_STATIC=true` e
`STATIC_DIR=/opt/bingwlp/current/web/dist`; in `deploy/nginx/bingwlp.conf` la parte
statica diventa inutile (nginx può inoltrare tutto al backend). Costo: ogni asset
passa da Node e nginx non può cachare in modo aggressivo i bundle con hash.

**Alternativa A2 — CDN davanti a tutto.** Gli asset con hash nel nome sono immutabili
e si possono pubblicare su object storage/CDN servendoli da un altro dominio: nginx
resta solo su `/api/*` e `index.html`. In quel caso aggiungete l'host del CDN a
`script-src`, `style-src` e `img-src` della CSP.

---

## 2. Prerequisiti

| Requisito | Dettaglio |
| --------- | --------- |
| Server | VPS **Ubuntu LTS** (22.04+, testato fino a 26.04), 1 vCPU / 1 GB RAM minimo (2 GB comodi per la build) |
| Disco | ≥ 10 GB liberi |
| Accesso | utente con `sudo` (o root) via SSH |
| DNS | record **A** (e **AAAA** se IPv6) `wallpaper.example.com` → IP del server. Il TLS richiede che il DNS risolva **prima** di lanciare certbot |
| Porte | 22 (SSH), 80, 443 aperte |
| Sorgente | repo `https://github.com/Maxster81/BingWLP.git` (o un fork) |
| Runtime | **Node.js 20** (`.nvmrc` = `20`, `engines: >=20.11`) |

Verifica rapida prima di iniziare:

```bash
lsb_release -a                        # Ubuntu LTS (testato: 22.04 / 24.04 / 26.04)
getent hosts wallpaper.example.com    # deve GIÀ risolvere all'IP di questo server
free -h && df -h /
```

---

## 3. Quick start (con gli script)

Percorso rapido per chi vuole il risultato senza leggere tutti i dettagli.
**I comandi vanno eseguiti dalla root del repository.**

```bash
# 1) Porta il repo sul server (scegli la tua via preferita)
git clone https://github.com/Maxster81/BingWLP.git ~/bingwlp
cd ~/bingwlp

# 2) Prepara il sistema: nginx, Node 20, utente bingwlp, cartelle, unit, nginx, ufw
sudo bash scripts/install-ubuntu.sh

# 3) Personalizza dominio e variabili
sudo nano /etc/nginx/sites-available/bingwlp.conf     # server_name wallpaper.example.com
sudo nginx -t && sudo systemctl reload nginx
sudo nano /etc/bingwlp/bingwlp.env                    # HOST/PORT/SERVE_STATIC/market/log

# 4) Metti il codice nel percorso di deploy del deploy atomico
sudo -u bingwlp git clone https://github.com/Maxster81/BingWLP.git /opt/bingwlp/repo
cd /opt/bingwlp/repo

# 5) Primo deploy: build + pubblicazione atomica + restart + healthcheck
sudo bash scripts/deploy.sh

# 6) Verifica
curl -fsS http://127.0.0.1:8080/api/health | python3 -m json.tool
curl -I http://wallpaper.example.com/            # atteso 200, Cache-Control: no-store
systemctl status bingwlp --no-pager

# 7) TLS (solo dopo che il DNS punta qui!)
sudo apt-get install -y python3-certbot-nginx
sudo certbot --nginx -d wallpaper.example.com -d www.wallpaper.example.com
```

Se qualcosa non torna: § 12 (Troubleshooting) e § 15 (Checklist finale).


---

## 4. Deploy manuale "fai da te" (cosa fa lo script, passo per passo)

Per chi vuole capire ogni singolo comando, senza usare `install-ubuntu.sh`.

### 4.1 Pacchetti di base

```bash
sudo apt-get update
sudo apt-get install -y nginx curl ca-certificates gnupg git logrotate
```

Non serve `build-essential`: il progetto non ha moduli nativi da compilare
(Fastify, zod, React e Vite sono JavaScript puro).

### 4.2 Node.js 20 (NodeSource)

```bash
sudo install -d -m 0755 /usr/share/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | sudo gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
sudo chmod 0644 /usr/share/keyrings/nodesource.gpg
echo 'deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main' \
  | sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt-get update
sudo apt-get install -y nodejs
node -v   # atteso v20.x
npm -v
```

**Variante con nvm** (sconsigliata in produzione): nvm è per-utente, quindi
`ExecStart` deve puntare al binario assoluto dentro la home e `ProtectHome=true`
va disattivato.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
nvm install 20 && nvm use 20     # nvm legge .nvmrc = 20
which node                       # ricordati questo path per ExecStart
```

### 4.3 Utente di sistema e cartelle

```bash
sudo useradd --system --create-home --home-dir /opt/bingwlp \
  --shell /usr/sbin/nologin --comment "BingWLP service account" bingwlp

sudo install -d -m 0755 -o bingwlp -g bingwlp /opt/bingwlp
sudo install -d -m 0755 -o bingwlp -g bingwlp /opt/bingwlp/releases
sudo install -d -m 0750 -o root    -g bingwlp /etc/bingwlp
sudo install -d -m 0730 -o root    -g bingwlp /var/log/bingwlp
sudo install -d -m 0750 -o bingwlp -g bingwlp /var/lib/bingwlp
sudo install -d -m 0750 -o bingwlp -g bingwlp /var/lib/bingwlp/images
sudo install -d -m 0755 -o root    -g root    /var/www/bingwlp/web
```

### 4.4 Codice nel percorso di deploy

```bash
sudo -u bingwlp git clone https://github.com/Maxster81/BingWLP.git /opt/bingwlp/repo
cd /opt/bingwlp/repo
```

### 4.5 Build

I comandi si eseguono **dalla root del monorepo** (npm workspaces `server` + `web`):

```bash
sudo -u bingwlp npm ci            # installazione riproducibile dal lockfile
sudo -u bingwlp npm run build     # web → web/dist, server → server/dist/index.js
```

Verifica degli artefatti:

```bash
ls -l /opt/bingwlp/repo/server/dist/index.js
ls -l /opt/bingwlp/repo/web/dist/index.html
ls -l /opt/bingwlp/repo/web/dist/assets | head
```

`npm run build` esegue, nell'ordine: `npm run build --workspace web`
(`tsc --noEmit && vite build`) e `npm run build --workspace server`
(`tsup src/index.ts --format esm --target node20 --clean --sourcemap`).

### 4.6 Rilascio in una release e symlink

```bash
TS=$(date -u +%Y%m%d-%H%M%S)
RELEASE=/opt/bingwlp/releases/${TS}-manual
sudo install -d -o bingwlp -g bingwlp "$RELEASE"
for item in package.json package-lock.json node_modules server web; do
  sudo cp -al "/opt/bingwlp/repo/$item" "$RELEASE/$item"   # hardlink: veloce, zero spazio extra
done
sudo chown -R bingwlp:bingwlp "$RELEASE"

# switch ATOMICO dei symlink (mv -T = rename: mai un istante "senza" link)
sudo ln -sfn "$RELEASE" /opt/bingwlp/current.new && sudo mv -T /opt/bingwlp/current.new /opt/bingwlp/current
sudo ln -sfn "$RELEASE/web/dist" /var/www/bingwlp/web/dist.new && sudo mv -T /var/www/bingwlp/web/dist.new /var/www/bingwlp/web/dist
```

### 4.7 Avvio e verifica

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now bingwlp
sudo systemctl status bingwlp --no-pager
sudo journalctl -u bingwlp -n 50 --no-pager
curl -fsS http://127.0.0.1:8080/api/health | python3 -m json.tool
```


---

## 5. Configurazione delle variabili d'ambiente

Il backend legge l'ambiente in `server/src/config.ts` con zod e `.catch(default)`:
**una variabile mancante o non valida non fa fallire l'avvio**, ricade sul default.
Il file di sistema vive in `/etc/bingwlp/bingwlp.env` (installato da
`deploy/bingwlp.env.example`) ed è letto da systemd via `EnvironmentFile=`.

Formato: una variabile per riga, `CHIAVE=valore`, **senza `export`**, senza
espansione di variabili, `#` a inizio riga per i commenti.
Permessi consigliati: `0640 root:bingwlp`.

| Variabile | Default (contratto) | Valore di produzione consigliato | Note |
| --------- | ------------------- | -------------------------------- | ---- |
| `HOST` | `0.0.0.0` | `127.0.0.1` | con nginx sulla stessa macchina il backend **non** va esposto |
| `PORT` | `8080` | `8080` | deve combaciare con `proxy_pass` in nginx |
| `NODE_ENV` | `development` | `production` | |
| `LOG_LEVEL` | `info` | `info` | `debug` solo per diagnosi |
| `DEFAULT_MARKET` | `it-IT` | `it-IT` | formato `^[a-z]{2}-[A-Z]{2}$` |
| `BING_API_BASE` | `https://services.bingapis.com/ge-apps/api/v2` | invariato | endpoint temi/immagini |
| `BING_CDN_BASE` | `https://www.bing.com/th` | invariato | se lo cambiate, aggiornate la CSP di nginx |
| `UPSTREAM_TIMEOUT_MS` | `8000` | `8000` | timeout verso Bing |
| `CACHE_TTL_THEMES_SEC` | `21600` | `21600` | 6h di cache sui temi |
| `CACHE_TTL_IMAGES_SEC` | `3600` | `3600` | 1h di cache sulle immagini |
| `CACHE_IMAGE_BYTES` | `2147483648` | `2147483648` | presente in `server/.env.example` (non nella tabella di `docs/API.md`) |
| `SERVE_STATIC` | `true` | **`false`** | con nginx: lo statico lo serve nginx |
| `STATIC_DIR` | `../web/dist` | `/opt/bingwlp/current/web/dist` | usato solo con `SERVE_STATIC=true`; in assoluto è indipendente dalla cwd |
| `IMAGE_STORE` | `null` | `null` | **storico immagini non implementato** |
| `IMAGE_STORE_DIR` | `./data/images` | `/var/lib/bingwlp/images` | unica cartella scrivibile dal servizio |
| `ALLOW_ORIGINS` | vuoto | vuoto | il frontend usa URL relativi → same-origin |
| `RATE_LIMIT_MAX` | `0` (off) | `0` o `120` | richieste/minuto per IP |

Installazione/modifica:

```bash
sudo install -m 0640 -o root -g bingwlp deploy/bingwlp.env.example /etc/bingwlp/bingwlp.env
sudo nano /etc/bingwlp/bingwlp.env
sudo systemctl restart bingwlp
sudo journalctl -u bingwlp -n 20 --no-pager
```

Per ispezionare l'ambiente effettivamente visto dal processo (systemd non mostra i
valori di `EnvironmentFile` con `systemctl show`):

```bash
PID=$(systemctl show -p MainPID --value bingwlp)
sudo tr '\0' '\n' < /proc/"$PID"/environ | sort | grep -E 'HOST|PORT|SERVE_STATIC|NODE_ENV'
```

> **Nota.** `NODE_ENV` non è nella tabella di `docs/API.md` ma è letta da
> `config.ts` (campo `nodeEnv`) ed è presente in `server/.env.example`:
> in produzione va impostata a `production`.


---

## 6. systemd: installazione e gestione

### 6.1 Installazione della unit

```bash
sudo install -m 0644 deploy/systemd/bingwlp.service /etc/systemd/system/bingwlp.service

# Drop-in del deploy atomico (necessario con scripts/deploy.sh, che usa /opt/bingwlp/current)
sudo install -d -m 0755 /etc/systemd/system/bingwlp.service.d
sudo install -m 0644 deploy/systemd/bingwlp.service.d/10-release.conf \
  /etc/systemd/system/bingwlp.service.d/10-release.conf

sudo systemctl daemon-reload
sudo systemctl enable bingwlp     # parte al boot; non lo avvia subito
sudo systemctl start bingwlp
```

### 6.2 Cosa contiene la unit (punti importanti)

| Direttiva | Valore | Perché |
| --------- | ------ | ------ |
| `User` / `Group` | `bingwlp` | processo non privilegiato |
| `WorkingDirectory` | `/opt/bingwlp` (drop-in: `/opt/bingwlp/current`) | base dei path relativi |
| `EnvironmentFile` | `/etc/bingwlp/bingwlp.env` | env senza duplicare valori nella unit |
| `ExecStart` | `/usr/bin/node server/dist/index.js` | bundle di tsup, path assoluto del runtime |
| `Restart` / `RestartSec` | `always` / `3` | riparte dopo crash senza tempestare il sistema |
| `KillSignal` / `TimeoutStopSec` | `SIGTERM` / `20` | `index.ts` gestisce SIGTERM con `app.close()` (graceful shutdown) |
| `ProtectSystem` | `strict` | tutto il filesystem è read-only per il servizio |
| `ReadWritePaths` | `/var/lib/bingwlp` | unica eccezione in scrittura (store futuro) |
| `ProtectHome`, `PrivateTmp`, `NoNewPrivileges` | `true` | isolamento |
| `CapabilityBoundingSet` / `AmbientCapabilities` | vuoti | la 8080 non è privilegiata: nessuna capability serve |
| `LimitNOFILE` | `65535` | molte connessioni verso Bing e verso i client |
| `MemoryHigh` / `MemoryMax` | `1536M` / `2G` | allineati a `CACHE_IMAGE_BYTES` |

> **Perché il journal e non un file di log.** La unit di default logga su
> **journald**: rotazione e retention automatiche (`/etc/systemd/journald.conf`),
> ricerca strutturata (`journalctl -u bingwlp -o json`), rate limiting e nessun
> permesso da amministrare in `/var/log`. Se preferite i file puri, decommentate
> `StandardOutput=append:/var/log/bingwlp/bingwlp.log` e
> `StandardError=append:/var/log/bingwlp/bingwlp.log` nella copia installata della
> unit e attivate la regola `deploy/logrotate/bingwlp`.

> **Nota su `MemoryDenyWriteExecute`.** Non è impostata di proposito: Node compila
> codice a runtime (JIT di V8) e ha bisogno di mapping scrivibili ed eseguibili.
> Impostandola a `true` il servizio crasha all'avvio.

### 6.3 Comandi di uso quotidiano

```bash
sudo systemctl status bingwlp            # stato sintetico + ultime righe di log
sudo systemctl restart bingwlp           # applica nuova release o nuove env
sudo systemctl stop bingwlp              # arresto (graceful)
systemctl is-active bingwlp              # "active" / "inactive" / "failed"
sudo systemd-analyze security bingwlp    # punteggio di hardening della unit

# Verifica della configurazione SENZA applicarla
sudo systemd-analyze verify /etc/systemd/system/bingwlp.service
sudo systemctl show bingwlp -p WorkingDirectory -p ExecStart -p Restart
```

### 6.4 Log

```bash
sudo journalctl -u bingwlp -n 100 --no-pager     # ultime 100 righe
sudo journalctl -u bingwlp -f                    # follow in tempo reale
sudo journalctl -u bingwlp --since "1 hour ago"
sudo journalctl -u bingwlp -p err                # solo errori
sudo journalctl -u bingwlp -o json | head        # log strutturati di pino
sudo journalctl -u bingwlp --since today | grep -i cache

# Spazio usato dal journal e limiti
journalctl --disk-usage
sudo journalctl --vacuum-time=30d                # conserva solo 30 giorni
```

Limiti permanenti (opzionale) in `/etc/systemd/journald.conf`:

```ini
SystemMaxUse=500M
MaxRetentionSec=1month
```

```bash
sudo systemctl restart systemd-journald
```


---

## 7. nginx: installazione, configurazione e SPA fallback

### 7.1 Installazione della configurazione

```bash
sudo install -m 0644 deploy/nginx/bingwlp.conf /etc/nginx/sites-available/bingwlp.conf
sudo ln -sfn /etc/nginx/sites-available/bingwlp.conf /etc/nginx/sites-enabled/bingwlp.conf

# Il sito di default di Ubuntu occupa la porta 80 con default_server: lo togliamo
sudo rm -f /etc/nginx/sites-enabled/default

# 1) Sostituisci il dominio PRIMA di testare
sudo sed -i 's/wallpaper\.example\.com/IL-TUO-DOMINIO.example/' /etc/nginx/sites-available/bingwlp.conf
grep server_name /etc/nginx/sites-available/bingwlp.conf

# 2) Verifica la sintassi: se fallisce NON ricaricare
sudo nginx -t
# atteso: syntax is ok / test is successful

sudo systemctl reload nginx
```

`nginx -t` valida la configurazione **senza** applicarla: se ci sono errori nginx
continua a servire quella precedente. È la ragione per cui il reload va sempre
fatto **dopo** un test riuscito.

### 7.2 Cosa fa la configurazione

| Blocco | Funzione |
| ------ | -------- |
| `root /var/www/bingwlp/web/dist` | serve il build del frontend (symlink alla release corrente) |
| `location ^~ /assets/` | bundle Vite con hash nel nome → `Cache-Control: public, max-age=31536000, immutable` |
| `location ~* \.(js\|css\|...)` | altri statici (favicon, og-image…) → 30 giorni, perché **non** hanno hash |
| `location = /index.html` | **`no-store`**: è il punto d'ingresso della SPA e referenzia gli asset con hash; cacharlo = schermata bianca dopo un deploy |
| `location /` | SPA fallback `try_files $uri $uri/ /index.html` |
| `location /api/` | `proxy_pass http://127.0.0.1:8080` con `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`, HTTP/1.1 e `proxy_read_timeout 60s` |
| `location = /api/health` | healthcheck con timeout corti (uptime checker, deploy, docker) |
| gzip | attivo su HTML/CSS/JS/JSON/SVG (le immagini sono già compresse: escluse) |
| header di sicurezza | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP |
| `client_max_body_size 10m` | limite sul body (l'API è di sola lettura) |
| `server_tokens off` | non rivela la versione di nginx |

**Dettaglio importante sulla cache.** Solo gli asset dentro `/assets/` hanno un hash
nel nome e possono quindi essere cachati `immutable` per un anno. `index.html` non ha
hash: se il browser lo cachasse continuerebbe a chiedere i bundle vecchi (non più
esistenti) dopo un deploy, con schermata bianca. Per questo è `no-store`.

**Dettaglio importante sugli `add_header`.** In nginx gli `add_header` non sono
ereditati da un `location` che ne dichiara a sua volta uno. Per questo i blocchi con
cache (`/assets/`, le altre estensioni, `index.html`) **ripetono** gli header di
sicurezza. Se aggiungete un header a livello `server`, aggiungetelo anche là.

**Dettaglio importante sulla CSP.** La galleria carica le immagini da
`https://www.bing.com` (il backend risponde `302` verso il CDN Bing): senza quell'host
in `img-src` le immagini non si vedono. I temi animati usano un MP4 di
`download.microsoft.com`, incluso in `media-src`. Se cambiate `BING_CDN_BASE` nel
file env, aggiornate la CSP di conseguenza.

### 7.3 SPA fallback e verifica

Il frontend usa un hash router, quindi non genera path profondi; la regola
`try_files $uri $uri/ /index.html` è comunque presente così l'app resta corretta
anche passando a un router con History API.

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://wallpaper.example.com/una/rotta/inesistente
# atteso: 200 (viene servito index.html)

curl -s -o /dev/null -w '%{http_code}\n' http://wallpaper.example.com/api/rotta-inesistente
# atteso: 404 in JSON (le rotte /api NON fanno fallback su index.html)

curl -sI http://wallpaper.example.com/assets/ | grep -i cache
curl -sI http://wallpaper.example.com/ | grep -i cache    # atteso: no-store

sudo nginx -T | grep -A5 'server_name'   # dump della configurazione attiva
sudo ss -ltnp | grep -E ':80|:443|:8080'
sudo tail -n 50 /var/log/nginx/bingwlp.error.log
```


---

## 8. TLS con certbot (Let's Encrypt)

Prerequisito: il DNS del dominio punta **già** a questo server (certbot usa una
challenge HTTP-01 sulla porta 80).

```bash
sudo apt-get update
sudo apt-get install -y python3-certbot-nginx

# Sostituisci il dominio e, se vuoi, aggiungi il www
sudo certbot --nginx -d wallpaper.example.com -d www.wallpaper.example.com
```

Cosa fa `certbot --nginx`:

1. verifica il dominio con una challenge HTTP su `/.well-known/acme-challenge/`;
2. scrive i certificati in `/etc/letsencrypt/live/<dominio>/`;
3. **modifica la config nginx installata** aggiungendo `listen 443 ssl` con i path
   dei certificati, il redirect `80 → 443` e le raccomandazioni TLS;
4. ricarica nginx.

Quando certbot chiede del redirect, scegli la versione `https` (redirect di tutto il
traffico HTTP). Verifica:

```bash
sudo certbot certificates                                  # elenco e scadenze
curl -sI https://wallpaper.example.com/ | head -5          # atteso 200
curl -sI http://wallpaper.example.com/ | head -3           # atteso 301 verso https

echo | openssl s_client -connect wallpaper.example.com:443 -servername wallpaper.example.com 2>/dev/null \
  | openssl x509 -noout -subject -dates
```

### 8.1 Rinnovo automatico

Certbot installa un timer systemd che rinnova i certificati circa 30 giorni prima
della scadenza; il deploy hook ufficiale di `certbot --nginx` ricarica nginx dopo un
rinnovo riuscito.

```bash
systemctl list-timers | grep -i certbot        # certbot.timer
sudo systemctl status certbot.timer --no-pager
sudo certbot renew --dry-run                   # TEST completo del rinnovo
sudo ls /etc/letsencrypt/renewal-hooks/deploy/ # eventuali hook custom
sudo ls /etc/letsencrypt/renewal/              # file di stato per dominio
```

Promemoria: il certificato copre **solo** i nomi registrati con `-d`. Aggiungere
`www` dopo significa ripetere il comando con entrambi i `-d`.

---

## 9. Aggiornamenti: deploy, deploy manuale e rollback

### 9.1 Deploy con lo script (consigliato)

```bash
cd /opt/bingwlp/repo
sudo bash scripts/deploy.sh
```

Cosa fa, in ordine:

1. acquisisce un **lock** (`/var/lock/bingwlp-deploy.lock`) per evitare deploy concorrenti;
2. registra la release attiva (quella puntata da `current`) come **bersaglio di rollback**;
3. `git fetch` + `git checkout --force <branch>` + `git reset --hard origin/<branch>`
   (equivalente del solo fast-forward, ma deterministico in automazione);
4. `npm ci` (completo: serve alla build) e `npm run build`;
5. `npm prune --omit=dev` per alleggerire la release;
6. crea `/opt/bingwlp/releases/<timestamp>-<sha>` copiando gli artefatti con
   **hardlink** (`cp -al`: istantaneo e senza spazio duplicato);
7. ripunta in modo **atomico** `/opt/bingwlp/current` e
   `/var/www/bingwlp/web/dist` alla nuova release;
8. `systemctl restart bingwlp` e **healthcheck** con retry su
   `http://127.0.0.1:8080/api/health`;
9. se l'healthcheck fallisce → **rollback automatico** alla release precedente
   (nuovo switch dei symlink + restart + nuovo healthcheck);
10. applica la retention delle release (`KEEP_RELEASES`, default 5) e stampa il riepilogo.

Parametri utili (variabili d'ambiente prima del comando):

```bash
sudo BRANCH=main KEEP_RELEASES=3 bash scripts/deploy.sh
sudo HEALTH_RETRIES=60 bash scripts/deploy.sh          # server lenti
sudo SKIP_GIT=1 bash scripts/deploy.sh                 # codice già presente, niente git
sudo PRUNE=0 bash scripts/deploy.sh                    # non rimuovere le devDependencies
```

### 9.2 Deploy manuale (senza script)

```bash
cd /opt/bingwlp/repo
sudo -u bingwlp git fetch --prune origin
sudo -u bingwlp git reset --hard origin/main
sudo -u bingwlp npm ci
sudo -u bingwlp npm run build

# nuova release + symlink (vedi § 4.6 per i comandi completi)
TS=$(date -u +%Y%m%d-%H%M%S); PREV=$(readlink -f /opt/bingwlp/current)
RELEASE=/opt/bingwlp/releases/${TS}-manual
sudo install -d -o bingwlp -g bingwlp "$RELEASE"
for item in package.json package-lock.json node_modules server web; do
  sudo cp -al "/opt/bingwlp/repo/$item" "$RELEASE/$item"
done
sudo chown -R bingwlp:bingwlp "$RELEASE"
sudo ln -sfn "$RELEASE" /opt/bingwlp/current.new && sudo mv -T /opt/bingwlp/current.new /opt/bingwlp/current
sudo ln -sfn "$RELEASE/web/dist" /var/www/bingwlp/web/dist.new && sudo mv -T /var/www/bingwlp/web/dist.new /var/www/bingwlp/web/dist

sudo systemctl restart bingwlp
curl -fsS http://127.0.0.1:8080/api/health | python3 -m json.tool || echo "ROLLBACK: $PREV"
```

### 9.3 Rollback

**Automatico**: `scripts/deploy.sh` lo fa da solo se l'healthcheck fallisce dopo il
deploy (riporta `current` e il web root alla release precedente e riavvia).

**Manuale**:

```bash
# 1) elenca le release disponibili, dalla più recente
ls -1dt /opt/bingwlp/releases/*/

# 2) scegli il bersaglio e ripunta i symlink (atomico)
TARGET=/opt/bingwlp/releases/20260928-113000-abc1234
sudo ln -sfn "$TARGET" /opt/bingwlp/current.new && sudo mv -T /opt/bingwlp/current.new /opt/bingwlp/current
sudo ln -sfn "$TARGET/web/dist" /var/www/bingwlp/web/dist.new && sudo mv -T /var/www/bingwlp/web/dist.new /var/www/bingwlp/web/dist
sudo systemctl restart bingwlp

# 3) verifica
curl -fsS http://127.0.0.1:8080/api/health | python3 -m json.tool
cat "$TARGET/RELEASE"     # commit, data, versione Node della release
```

Il rollback **non** ricostruisce nulla: ogni release è autosufficiente
(`node_modules` + `server/dist` + `web/dist`) ed è immutabile, perché nessun
processo scrive quei file.


---

## 10. Deploy alternativo con Docker e Docker Compose

### 10.1 Prerequisiti

```bash
# Docker Engine + plugin compose (script ufficiale)
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"      # poi rientra in sessione
docker --version && docker compose version
```

### 10.2 Build e avvio

```bash
cd <root del repo>

# il file env del container (NON è quello di /etc/bingwlp: è nella cartella deploy/)
cp deploy/bingwlp.env.example deploy/bingwlp.env
nano deploy/bingwlp.env      # DEFAULT_MARKET, LOG_LEVEL, RATE_LIMIT_MAX...

# build + avvio in background
docker compose -f deploy/docker-compose.yml up -d --build

docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs -f bingwlp
curl -fsS http://127.0.0.1:8080/api/health | python3 -m json.tool
```

Il compose sovrascrive `HOST`, `PORT`, `SERVE_STATIC` e `STATIC_DIR` con un blocco
`environment:` (che ha precedenza su `env_file`), perché **dentro il container il
backend deve servire anche il frontend**:

- `HOST=0.0.0.0` — altrimenti la porta pubblicata non sarebbe raggiungibile;
- `SERVE_STATIC=true` e `STATIC_DIR=/app/web/dist` — non c'è nginx.

### 10.3 Cosa fa il Dockerfile (`deploy/Dockerfile`)

| Stage | Contenuto |
| ----- | --------- |
| `builder` (`node:20-alpine`) | copia i `package.json` dei workspace + `package-lock.json` → `npm ci` (layer di cache stabile) → copia i sorgenti → `npm run build` → `npm prune --omit=dev` |
| `runtime` (`node:20-alpine`) | `apk add dumb-init`, utente non root `bingwlp` (uid/gid **10001**), copia `node_modules` prunato + `server/dist` + `web/dist`, `USER bingwlp`, `EXPOSE 8080`, `HEALTHCHECK` su `/api/health`, `ENTRYPOINT ["dumb-init","--"]`, `CMD ["node","server/dist/index.js"]` |

Note:

- `dumb-init` fa da PID 1 e inoltra correttamente `SIGTERM`, così il graceful
  shutdown di Fastify (`app.close()`) funziona anche con `docker stop`.
  **Alternativa**: `docker run --init` oppure `init: true` nel compose (equivalenti).
- L'`HEALTHCHECK` usa `node -e` con il `fetch` nativo: nessun `curl`/`wget` in più
  nell'immagine.
- Il volume `bingwlp-data` è montato su `/var/lib/bingwlp` (**store immagini
  futuro**). Un volume vuoto non eredita ownership dall'immagine: al primo avvio:

  ```bash
  docker compose -f deploy/docker-compose.yml run --rm --user root \
    bingwlp chown -R 10001:10001 /var/lib/bingwlp
  ```

### 10.4 Reverse proxy davanti al container (opzionale)

Il compose include un profilo `proxy` commentato (nginx o Caddy). Per attivarlo:
scommentare la variante scelta, poi

```bash
docker compose -f deploy/docker-compose.yml --profile proxy up -d --build
```

Con il profilo attivo **non** pubblicare la 8080 sull'host: il proxy parla con il
container sulla rete interna usando il nome del servizio (`proxy_pass http://bingwlp:8080`
per nginx, `reverse_proxy bingwlp:8080` per Caddy), non `127.0.0.1`.

### 10.5 Aggiornamento e manutenzione

```bash
cd <root del repo>
git pull --ff-only
docker compose -f deploy/docker-compose.yml up -d --build     # rebuild + ricrea solo se cambia
docker compose -f deploy/docker-compose.yml ps
docker image prune -f                                          # rimuovi immagini orfane
```

**Rollback Docker**: usare tag immutabili invece di `latest`.

```bash
docker build -f deploy/Dockerfile -t bingwlp:$(git rev-parse --short HEAD) .
# e nel compose: image: bingwlp:<sha>
# rollback: cambiare il tag e rifare `up -d` (nessun rebuild)
```

### 10.6 Quando preferire Docker e quando systemd

| | nginx + systemd | Docker |
| --- | --- | --- |
| Overhead | minimo | container + demone |
| Isolamento | hardening systemd | namespace/cgroup completi |
| TLS | certbot sul host | certbot/nginx/Caddy come container |
| Debug | `journalctl`, `systemctl` | `docker logs`, `docker exec` |
| Riproducibilità | dipende dal host | immagine immutabile |
| Aggiornamenti di sistema | `apt upgrade` | rebuild dell'immagine |


---

## 11. Sviluppo locale e build di produzione

### 11.1 Sviluppo

```bash
npm ci                 # dalla root del monorepo (npm workspaces)
npm run dev            # avvia backend e frontend in parallelo (npm-run-all)
```

- **Backend**: `tsx watch src/index.ts` → `http://127.0.0.1:8080` (con `SERVE_STATIC=true`
  e `STATIC_DIR=../web/dist`; in dev lo statico può non esistere: il backend logga un
  warning e serve solo l'API).
- **Frontend**: Vite → `http://127.0.0.1:5173`, con **proxy** di `/api` verso
  `http://127.0.0.1:8080` (configurato in `web/vite.config.ts`). Il browser parla
  sempre con la 5173, quindi **niente CORS**.

```
browser :5173 ──/api/*──▶ proxy Vite ──▶ backend :8080
```

Per puntare il proxy a un backend diverso: `VITE_API_PROXY=http://host:porta npm run dev`.

Comandi separati, se servono:

```bash
npm run dev:server        # solo backend
npm run dev:web           # solo frontend
```

### 11.2 Verifiche prima di un deploy

```bash
npm run typecheck         # tsc --noEmit su server e web
npm test                  # vitest su server e web (nessuna chiamata di rete reale)
npm run ci                # typecheck + build + test: è ciò che gira nella CI
```

### 11.3 Build di produzione

```bash
npm ci
npm run build
```

Risultato:

| Percorso | Contenuto |
| -------- | --------- |
| `web/dist/` | SPA compilata: `index.html` + `assets/*` con hash nel nome |
| `server/dist/index.js` | bundle ESM del backend (tsup, `--target node20`) |
| `server/dist/index.js.map` | sourcemap (non serve in produzione: si può rimuovere) |

Avvio locale della build, utile per provarla prima del deploy:

```bash
SERVE_STATIC=true STATIC_DIR=../web/dist NODE_ENV=production npm start
# → node server/dist/index.js su http://127.0.0.1:8080
```

---

## 12. Monitoraggio, log e backup

### 12.1 Log del backend

Con la unit di default i log finiscono nel journal (vedi § 6.4).

```bash
sudo journalctl -u bingwlp -f                     # live
sudo journalctl -u bingwlp -n 200 --no-pager
sudo journalctl -u bingwlp -p warning --since "1 hour ago"
```

Access log di nginx (dedicati: `/var/log/nginx/bingwlp.access.log`,
`/var/log/nginx/bingwlp.error.log`):

```bash
sudo tail -f /var/log/nginx/bingwlp.access.log
sudo grep -E ' (4|5)[0-9]{2} ' /var/log/nginx/bingwlp.access.log | tail -50
sudo awk '{print $9}' /var/log/nginx/bingwlp.access.log | sort | uniq -c | sort -rn | head
```

Logrotate: per i log nginx è già attivo quello di sistema (`/etc/logrotate.d/nginx`).
Per il **backend in modalità file** (se avete disattivato il journal):

```bash
sudo install -m 0644 deploy/logrotate/bingwlp /etc/logrotate.d/bingwlp
sudo logrotate --debug /etc/logrotate.d/bingwlp      # dry-run: non modifica nulla
sudo logrotate --force --verbose /etc/logrotate.d/bingwlp
```

La regola `deploy/logrotate/bingwlp` ruota **settimanalmente**, conserva **8**
rotazioni, comprime (`delaycompress`) e usa `copytruncate` (necessario perché il
backend non riapre i file di log su SIGHUP). Con `missingok` è innocua quando il log
su file non esiste.

### 12.2 Healthcheck

`GET /api/health` risponde **sempre `200`** finché il processo è vivo; il campo
`status` è `degraded` quando Bing non risponde su nessun giro recente e la cache è
esaurita.

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

```bash
curl -fsS http://127.0.0.1:8080/api/health | python3 -m json.tool
curl -fsS https://wallpaper.example.com/api/health | python3 -m json.tool
```

Monitoraggio minimo consigliato:

```bash
# cron ogni 5 minuti: riavvia il servizio solo se l'API non risponde
cat <<'CRON' | sudo tee /etc/cron.d/bingwlp-health
*/5 * * * * root curl -fsS --max-time 5 http://127.0.0.1:8080/api/health >/dev/null || systemctl restart bingwlp
CRON
```

Oppure un check esterno (uptime robot) sull'URL `https://<dominio>/api/health`,
verificando il **200**, non il contenuto.

### 12.3 Backup

| Cosa | Come |
| ---- | ---- |
| Codice | è in git: il "backup" è il repository remoto + le release in `/opt/bingwlp/releases` |
| Configurazione | copiare `/etc/bingwlp/bingwlp.env` e `/etc/nginx/sites-available/bingwlp.conf` (contengono la config che non è nel repo) |
| Certificati | `/etc/letsencrypt` (backup con l'intera cartella, include le chiavi) |
| Store immagini (**futuro**) | `scripts/backup-images.sh` |

```bash
# backup di configurazione e certificati
sudo tar czf /var/backups/bingwlp-config-$(date +%F).tar.gz \
  /etc/bingwlp /etc/nginx/sites-available/bingwlp.conf /etc/letsencrypt
```

`scripts/backup-images.sh` — **da usare quando lo store immagini sarà attivo**
(oggi `IMAGE_STORE=null`: la cartella `/var/lib/bingwlp/images` è vuota, lo script lo
rileva ed esce senza fare nulla).

```bash
sudo bash scripts/backup-images.sh
sudo RETENTION=14 RSYNC_DEST=backup@host:/srv/backups/bingwlp/ bash scripts/backup-images.sh

# cron giornaliero alle 03:30
echo '30 3 * * * root /opt/bingwlp/repo/scripts/backup-images.sh >/dev/null 2>&1' \
  | sudo tee /etc/cron.d/bingwlp-backup-images
```

Il backup **deve** uscire dal server (copia fuori sede con `RSYNC_DEST`): un backup
locale non protegge dalla perdita dell'host.

