#!/usr/bin/env bash
# =============================================================================
# BingWLP — backup-images.sh
# =============================================================================
# Backup della cartella dello STORE IMMAGINI.
#
# ATTENZIONE — STATO ATTUALE DEL PROGETTO
# Lo storico immagini NON è implementato: `IMAGE_STORE=null` (NullImageStore,
# no-op) e `/api/image` risponde 302 verso il CDN di Bing. Di conseguenza
# /var/lib/bingwlp/images è VUOTA e questo script, eseguito oggi, si limita a
# dirlo e a uscire con codice 0.
# Va considerato pronto "per quando lo store sarà attivo"
# (docs/API.md § "Archiviazione delle immagini (prevista, NON implementata)").
# Metterlo in cron ORA è comunque innocuo e permette di non dimenticarsene.
#
# COSA FA
#   1. verifica che la sorgente esista e non sia vuota
#   2. crea un archivio compresso datato in ${DEST_DIR}
#   3. replica l'archivio su un host remoto via rsync (opzionale)
#   4. applica la retention (${RETENTION} archivi più recenti)
#   5. stampa un riepilogo con dimensioni e istruzioni di restore
#
# USO
#   sudo bash scripts/backup-images.sh
#   sudo RETENTION=14 bash scripts/backup-images.sh
#   sudo RSYNC_DEST=backup@host:/srv/backups/bingwlp/ bash scripts/backup-images.sh
#
# CRON suggerito (giornaliero alle 03:30):
#   echo '30 3 * * * root /opt/bingwlp/repo/scripts/backup-images.sh >/dev/null 2>&1' \
#     | sudo tee /etc/cron.d/bingwlp-backup-images
# =============================================================================

set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Parametri
# -----------------------------------------------------------------------------
# Sorgente: deve combaciare con IMAGE_STORE_DIR in /etc/bingwlp/bingwlp.env
# (unica directory scrivibile dal servizio: ReadWritePaths=/var/lib/bingwlp).
SRC_DIR="${SRC_DIR:-/var/lib/bingwlp/images}"
# Destinazione locale: /var/backups è il posto canonico su Debian/Ubuntu.
DEST_DIR="${DEST_DIR:-/var/backups/bingwlp}"
# Quanti archivi conservare su questo server.
RETENTION="${RETENTION:-7}"
# Destinazione remota opzionale (formato rsync): vuota = nessuna replica.
RSYNC_DEST="${RSYNC_DEST:-}"
# Compressione: gzip (default) | zstd (più veloce, se installato) | none.
COMPRESS="${COMPRESS:-gzip}"

STAMP="$(date -u +%Y%m%d-%H%M%S)"
ARCHIVE_BASE="bingwlp-images-${STAMP}"

# -----------------------------------------------------------------------------
# Output
# -----------------------------------------------------------------------------
if [[ -t 1 ]]; then
  C_RESET=$'\e[0m'; C_BLUE=$'\e[1;34m'; C_GREEN=$'\e[1;32m'
  C_YELLOW=$'\e[1;33m'; C_RED=$'\e[1;31m'
else
  C_RESET=''; C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''
fi
step() { printf '%s==>%s %s\n' "${C_BLUE}" "${C_RESET}" "$*"; }
ok()   { printf '%s  ok%s %s\n' "${C_GREEN}" "${C_RESET}" "$*"; }
warn() { printf '%s  !!%s %s\n' "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
die()  { printf '%s errore:%s %s\n' "${C_RED}" "${C_RESET}" "$*" >&2; exit 1; }

trap 'die "comando fallito alla riga ${LINENO}: ${BASH_COMMAND}"' ERR

[[ "${EUID}" -eq 0 ]] || die "serve root: esegui con 'sudo bash $0'"

command -v tar >/dev/null 2>&1 || die "tar non installato (apt-get install -y tar)"

# -----------------------------------------------------------------------------
# 1. Verifica della sorgente
# -----------------------------------------------------------------------------
step "Verifica sorgente ${SRC_DIR}"

if [[ ! -d "${SRC_DIR}" ]]; then
  warn "sorgente inesistente: ${SRC_DIR}"
  warn "IMAGE_STORE è 'null' (store non implementato): non c'è nulla da salvare."
  warn "Nessuna azione eseguita. Uscita con successo per non far fallire il cron."
  exit 0
fi

# `find ... -print -quit`: evita di scandire milioni di file solo per capire
# se la cartella è vuota.
first_file="$(find "${SRC_DIR}" -type f -print -quit 2>/dev/null || true)"
if [[ -z "${first_file}" ]]; then
  warn "la cartella ${SRC_DIR} esiste ma è VUOTA (store non attivo): niente da salvare."
  exit 0
fi

src_size="$(du -sh "${SRC_DIR}" 2>/dev/null | cut -f1)"
file_count="$(find "${SRC_DIR}" -type f 2>/dev/null | wc -l)"
ok "sorgente ok: ${file_count} file, ${src_size}"

# -----------------------------------------------------------------------------
# 2. Archivio
# -----------------------------------------------------------------------------
step "Creazione archivio"

install -d -m 0700 "${DEST_DIR}"

# Scelta della compressione ed estensione conseguente.
case "${COMPRESS}" in
  gzip)
    ARCHIVE_NAME="${ARCHIVE_BASE}.tar.gz"
    tar_compress=(--gzip)
    ;;
  zstd)
    if command -v zstd >/dev/null 2>&1; then
      ARCHIVE_NAME="${ARCHIVE_BASE}.tar.zst"
      tar_compress=(--zstd)
    else
      warn "zstd non installato: uso gzip"
      ARCHIVE_NAME="${ARCHIVE_BASE}.tar.gz"
      tar_compress=(--gzip)
    fi
    ;;
  none)
    ARCHIVE_NAME="${ARCHIVE_BASE}.tar"
    tar_compress=()
    ;;
  *)
    die "COMPRESS non valido: '${COMPRESS}' (valori: gzip|zstd|none)"
    ;;
esac

ARCHIVE_PATH="${DEST_DIR}/${ARCHIVE_NAME}"

# Flag comuni:
#  --one-file-system ... non attraversa mount point (evita di copiare un volume
#                        montato per errore dentro la cartella immagini)
#  --warning=no-file-changed ... se un file viene scritto durante il backup tar
#                        lo segnala e uscirebbe con 1: falso allarme da ignorare
#  --ignore-failed-read ........ un file rimosso nel frattempo non fa fallire tutto
#  -C <padre> <basename> ....... i path nell'archivio sono relativi (images/...):
#                        il restore è indipendente dal percorso di destinazione
tar "${tar_compress[@]}" \
  --create --file "${ARCHIVE_PATH}" \
  --one-file-system \
  --warning=no-file-changed \
  --ignore-failed-read \
  -C "$(dirname -- "${SRC_DIR}")" "$(basename -- "${SRC_DIR}")"

# Post-condizione: l'archivio deve esistere e non essere vuoto.
if [[ ! -s "${ARCHIVE_PATH}" ]]; then
  die "archivio vuoto o non creato: ${ARCHIVE_PATH}"
fi
archive_size="$(du -h "${ARCHIVE_PATH}" | cut -f1)"
ok "archivio creato: ${ARCHIVE_PATH} (${archive_size})"

# -----------------------------------------------------------------------------
# 3. Replica remota opzionale
# -----------------------------------------------------------------------------
if [[ -n "${RSYNC_DEST}" ]]; then
  step "Replica su ${RSYNC_DEST}"
  command -v rsync >/dev/null 2>&1 || die "rsync non installato (apt-get install -y rsync)"
  rsync --archive --compress --partial --human-readable \
    "${ARCHIVE_PATH}" "${RSYNC_DEST}"
  ok "archivio replicato su ${RSYNC_DEST}"
else
  warn "RSYNC_DEST non impostato: il backup resta SOLO su questo server"
  warn "consiglio: replicare fuori sede (RSYNC_DEST=user@host:/percorso/)"
fi

# -----------------------------------------------------------------------------
# 4. Retention locale
# -----------------------------------------------------------------------------
step "Retention: mantengo i ${RETENTION} archivi più recenti su questo host"

# `ls -1t` ordina per mtime decrescente: i primi RETENTION restano.
mapfile -t archives < <(ls -1t "${DEST_DIR}"/bingwlp-images-*.tar.* 2>/dev/null || true)
removed=0
for (( i = RETENTION; i < ${#archives[@]}; i++ )); do
  rm -f -- "${archives[$i]}"
  ok "rimosso: $(basename -- "${archives[$i]}")"
  removed=$(( removed + 1 ))
done
# NB: niente `(( removed == 0 )) && ...` — con `set -e` un aritmetico falso
# farebbe terminare lo script prima del riepilogo.
if (( removed == 0 )); then
  ok "nessun archivio da rimuovere (${#archives[@]} presenti)"
fi

# -----------------------------------------------------------------------------
# 5. Riepilogo
# -----------------------------------------------------------------------------
step "Backup completato"
cat <<EOF

  Sorgente ....... ${SRC_DIR}  (${file_count} file, ${src_size})
  Archivio ....... ${ARCHIVE_PATH}  (${archive_size})
  Replica ........ ${RSYNC_DEST:-nessuna}
  Archivi ........ $(ls -1 "${DEST_DIR}"/bingwlp-images-*.tar.* 2>/dev/null | wc -l) in ${DEST_DIR} (retention ${RETENTION})
  Spazio usato ... $(du -sh "${DEST_DIR}" | cut -f1)

  RESTORE (da usare quando lo store immagini sarà attivo):
    sudo systemctl stop ${SERVICE_NAME:-bingwlp}
    sudo tar -xaf ${ARCHIVE_PATH} -C /var/lib/bingwlp
    sudo chown -R ${APP_USER:-bingwlp}:${APP_USER:-bingwlp} /var/lib/bingwlp/images
    sudo systemctl start ${SERVICE_NAME:-bingwlp}
EOF

