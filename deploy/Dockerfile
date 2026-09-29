# =============================================================================
# BingWLP — immagine Docker multi-stage (node:20-alpine)
# =============================================================================
#
# Build (dalla ROOT del repo: il context è il monorepo intero):
#   docker build -f deploy/Dockerfile -t bingwlp:latest .
#
# Run manuale:
#   docker run -d --name bingwlp -p 8080:8080 \
#     --env-file deploy/bingwlp.env bingwlp:latest
#
# Oppure con Compose (vedi deploy/docker-compose.yml).
#
# DIFFERENZA CHIAVE RISPETTO AL DEPLOY nginx+systemd:
# qui NON c'è nginx, quindi il backend DEVE servire anche il frontend
# (ENV SERVE_STATIC=true, STATIC_DIR=/app/web/dist). In produzione conviene
# comunque un reverse proxy davanti al container (profilo `proxy` del compose)
# per TLS/gzip/cache.
#
# HOST: nel container il bind è 0.0.0.0; Docker pubblica la porta solo con
# `-p`/`ports:`. Il file deploy/bingwlp.env.example contiene HOST=127.0.0.1,
# che dentro il container renderebbe la porta non raggiungibile dall'esterno:
# il compose lo sovrascrive con un `environment:` esplicito.
# =============================================================================


# -----------------------------------------------------------------------------
# STAGE 1 — builder: dipendenze complete + build di web e server
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Layer di cache delle dipendenze: si invalida SOLO se cambiano i manifest,
# non quando cambia il codice. Copiamo i package.json di TUTTI i workspace
# (npm ci in un monorepo li esige) e il lockfile della root.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
COPY web/package.json ./web/package.json

# `npm ci` (non `install`): installazione riproducibile dal lockfile.
# Include le devDependencies: servono tsup (server) e vite+tsc (web).
RUN npm ci

# Solo ora il codice sorgente: modificare una sorgente non invalida la cache di npm ci.
COPY server ./server
COPY web ./web

# `npm run build` dalla root = builda `web` (→ web/dist) e poi `server`
# (tsup → server/dist/index.js).
RUN npm run build

# Pruning delle devDependencies: al livello root di un monorepo npm workspaces
# `npm prune --omit=dev` rimuove le devDeps di TUTTI i workspace lasciando le
# runtime (fastify, zod, ...). Va eseguito DOPO la build, ovviamente.
# Verifica post-build (test -f/-d: se mancano gli artefatti la build fallisce qui)
# e rimozione dei sourcemap (non servono a runtime, appesantiscono l'immagine).
RUN npm prune --omit=dev \
    && test -f server/dist/index.js \
    && test -d web/dist \
    && rm -f server/dist/*.map web/dist/assets/*.map
# -----------------------------------------------------------------------------
# STAGE 2 — runtime: solo artefatti + dipendenze di produzione
# -----------------------------------------------------------------------------
FROM node:20-alpine AS runtime

# dumb-init come PID 1: un processo Node avviato come PID 1 NON riceve i signal
# di default dal kernel, quindi `docker stop` potrebbe non far completare il
# graceful shutdown di Fastify. dumb-init inoltra i signal e fa reap degli zombie.
# È nel repository principale di Alpine: installazione affidabile.
# ALTERNATIVA SENZA dumb-init: l'init di Docker fa lo stesso:
#   docker run --init ...     (oppure `init: true` in docker-compose.yml)
RUN apk add --no-cache dumb-init

# --- Utente non root con UID/GID FISSI --------------------------------------
# UID/GID fissi (10001) e non automatici: montando un volume (es. image store)
# i permessi restano prevedibili e riproducibili anche su altri host.
RUN addgroup -S -g 10001 bingwlp \
    && adduser -S -D -H -u 10001 -G bingwlp bingwlp

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080 \
    SERVE_STATIC=true \
    STATIC_DIR=/app/web/dist \
    IMAGE_STORE=null \
    IMAGE_STORE_DIR=/var/lib/bingwlp/images

WORKDIR /app

# Manifest e dipendenze di produzione (già prunate nello stage builder).
COPY --from=builder --chown=bingwlp:bingwlp /app/package.json ./package.json
COPY --from=builder --chown=bingwlp:bingwlp /app/package-lock.json ./package-lock.json
COPY --from=builder --chown=bingwlp:bingwlp /app/node_modules ./node_modules
# `server/package.json` è indispensabile: dichiara "type": "module" e Node lo usa
# per capire che server/dist/index.js è un modulo ESM.
COPY --from=builder --chown=bingwlp:bingwlp /app/server/package.json ./server/package.json
COPY --from=builder --chown=bingwlp:bingwlp /app/server/dist ./server/dist
COPY --from=builder --chown=bingwlp:bingwlp /app/web/dist ./web/dist

# Directory scrivibile dell'eventuale image store (volume in compose).
# Nota: un volume Docker montato su una directory vuota NON eredita ownership
# dall'immagine, quindi il primo avvio con volume va inizializzato a mano
# (vedi docs/DEPLOY.md § Docker, comando `docker run --rm ... chown`).
RUN mkdir -p /var/lib/bingwlp/images && chown -R bingwlp:bingwlp /var/lib/bingwlp

USER bingwlp:bingwlp

EXPOSE 8080

# HEALTHCHECK sull'endpoint reale dell'app: /api/health risponde JSON 200
# finché il processo è vivo (status "degraded" se Bing non risponde, ma il
# servizio resta up: per Docker conta la liveness).
# `node -e` evita di installare curl/wget nell'immagine finale.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/dist/index.js"]
