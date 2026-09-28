#!/usr/bin/env bash
# =============================================================================
# BingWLP — deploy.sh
# =============================================================================
# Deploy ATOMICO su Ubuntu con nginx + systemd.
#
# COME FUNZIONA (schema)
#
#   ${REPO_DIR}                  clone git di lavoro (sempre all'ultimo commit)
#        │  npm ci  →  npm run build
#        ▼
#   ${RELEASES_DIR}/<ts>-<sha>/  release IMMUTABILE (node_modules + server/dist + web/dist)
#        ▲
#        │  symlink atomico (mv -T)
#   ${OPT_DIR}/current  ────────┘   ← la unit systemd lavora QUI (drop-in 10-release.conf)
#   ${WEB_LINK}         ────────┘   ← nginx serve gli asset da QUI (root /var/www/bingwlp/web/dist)
#
# Ogni release è autosufficiente: il rollback è solo un cambio di symlink +
# restart del servizio, senza rebuild e senza toccare nginx.
#
# SEQUENZA
#   1. controlli (root, repo git, struttura)
#   2. git fetch + reset --hard sull'ultimo commit del branch  (aggiornamento codice)
#   3. npm ci (dipendenze COMPLETE: servono per la build) + npm run build
#   4. npm prune --omit=dev (alleggerisce la release: restano le dipendenze runtime)
#   5. nuova release + copia con hardlink (veloce, nessuno spazio duplicato)
#   6. switch atomico del symlink `current` e di quello del web root
#   7. systemctl restart + healthcheck con retry su /api/health
#   8. se l'healthcheck fallisce → ROLLBACK automatico alla release precedente
#   9. retention delle release vecchie
#
# USO
#   sudo bash scripts/deploy.sh
#   sudo BRANCH=main KEEP_RELEASES=3 bash scripts/deploy.sh
#   sudo SKIP_GIT=1 bash scripts/deploy.sh     # deploy dei file già presenti (niente git)
#
# PREREQUISITI
#   - scripts/install-ubuntu.sh già eseguito (utente, cartelle, unit, nginx)
#   - ${REPO_DIR} è un clone git del repo (salvo SKIP_GIT=1)
# =============================================================================

set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Parametri (override via variabili d'ambiente)
# -----------------------------------------------------------------------------
BRANCH="${BRANCH:-main}"
GIT_REMOTE="${GIT_REMOTE:-origin}"

REPO_DIR="${REPO_DIR:-/opt/bingwlp/repo}"
OPT_DIR="${OPT_DIR:-/opt/bingwlp}"
RELEASES_DIR="${RELEASES_DIR:-${OPT_DIR}/releases}"
CURRENT_LINK="${CURRENT_LINK:-${OPT_DIR}/current}"
WEB_LINK="${WEB_LINK:-/var/www/bingwlp/web/dist}"
WEB_LINK_DIR="${WEB_LINK_DIR:-$(dirname -- "${WEB_LINK}")}"
LIB_DIR="${LIB_DIR:-/var/lib/bingwlp}"

SERVICE_NAME="${SERVICE_NAME:-bingwlp}"
APP_USER="${APP_USER:-bingwlp}"
APP_GROUP="${APP_GROUP:-${APP_USER}}"

HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/api/health}"
# 30 tentativi × 1s: il backend è pronto in <1s, ma su VPS lenti diamo margine.
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"
HEALTH_SLEEP="${HEALTH_SLEEP:-1}"

# Numero di release mantenute (oltre a quella corrente) per il rollback.
KEEP_RELEASES="${KEEP_RELEASES:-5}"

# 1 = esegui `npm prune --omit=dev` prima di creare la release (release più piccola).
PRUNE="${PRUNE:-1}"
# 1 = salta git (utile per test o quando il codice è già in place).
SKIP_GIT="${SKIP_GIT:-0}"

LOCK_FILE="${LOCK_FILE:-/var/lock/bingwlp-deploy.lock}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"

# -----------------------------------------------------------------------------
# Output e utility
# -----------------------------------------------------------------------------
if [[ -t 1 ]]; then
  C_RESET=$'\e[0m'; C_BLUE=$'\e[1;34m'; C_GREEN=$'\e[1;32m'
  C_YELLOW=$'\e[1;33m'; C_RED=$'\e[1;31m'
else
  C_RESET=''; C_BLUE=''; C_GREEN=''; C_YELLOW=''; C_RED=''
fi

step() { printf '\n%s==>%s %s\n' "${C_BLUE}" "${C_RESET}" "$*"; }
ok()   { printf '%s  ok%s %s\n' "${C_GREEN}" "${C_RESET}" "$*"; }
warn() { printf '%s  !!%s %s\n' "${C_YELLOW}" "${C_RESET}" "$*" >&2; }
die()  { printf '\n%s errore:%s %s\n' "${C_RED}" "${C_RESET}" "$*" >&2; exit 1; }

trap 'die "comando fallito alla riga ${LINENO}: ${BASH_COMMAND}"' ERR

# -----------------------------------------------------------------------------
# 0. Lock: due deploy in parallelo si distruggerebbero a vicenda
# -----------------------------------------------------------------------------
# `flock` su fd 9: il lock si libera automaticamente alla morte del processo.
exec 9>"${LOCK_FILE}" || die "impossibile creare ${LOCK_FILE}"
if ! flock -n 9; then
  die "un altro deploy è in corso (lock ${LOCK_FILE}): attendi o rimuovi il lock"
fi
ok "lock acquisito (${LOCK_FILE})"

[[ "${EUID}" -eq 0 ]] || die "serve root: esegui con 'sudo bash $0'"

# -----------------------------------------------------------------------------
# 1. Funzioni operative
# -----------------------------------------------------------------------------

# Healthcheck con retry. Ritorna 0 se /api/health risponde 200, 1 altrimenti.
# Il JSON viene validato alla ricerca di "status" per non accettare una
# risposta HTML di un proxy che risponde 200 al posto del backend.
wait_for_health() {
  local attempt body
  for (( attempt = 1; attempt <= HEALTH_RETRIES; attempt++ )); do
    if body="$(curl -fsS --max-time 5 "${HEALTH_URL}" 2>/dev/null)"; then
      if [[ "${body}" == *'"status"'* ]]; then
        ok "healthcheck ok dopo ${attempt} tentativi: ${body}"
        return 0
      fi
      warn "risposta inattesa da ${HEALTH_URL}: ${body}"
    fi
    sleep "${HEALTH_SLEEP}"
  done
  warn "healthcheck FALLITO dopo ${HEALTH_RETRIES} tentativi su ${HEALTH_URL}"
  return 1
}

# Ripunta un symlink in modo ATOMICO:
#   ln -sfn produce un cambio non atomico (unlink+link) -> possibile finestra
#   in cui il path non esiste. `ln -sfn` su un file temporaneo + `mv -T`
#   (rename) è invece atomico: chi legge vede o il vecchio o il nuovo, mai niente.
switch_symlink() {
  local target="$1" link="$2" tmp="${2}.new.$$"
  ln -sfn "${target}" "${tmp}"
  mv -T "${tmp}" "${link}"
}

# Prepara il web root di nginx: deve essere un SYMLINK a <release>/web/dist.
# Se è ancora la directory segnaposto creata da install-ubuntu.sh, la sposta
# da parte (e la rimuove a fine deploy se tutto va bene).
prepare_web_link() {
  local release="$1"
  install -d -m 0755 "${WEB_LINK_DIR}"
  if [[ -e "${WEB_LINK}" && ! -L "${WEB_LINK}" ]]; then
    mv "${WEB_LINK}" "${WEB_LINK}.pre-deploy-${STAMP}"
    ok "directory di appoggio spostata in ${WEB_LINK}.pre-deploy-${STAMP}"
  fi
  switch_symlink "${release}/web/dist" "${WEB_LINK}"
}

# Porta il servizio alla release indicata (restart + verifica).
# Usata sia dal deploy normale sia dal rollback.
activate_release() {
  local release="$1"
  systemctl restart "${SERVICE_NAME}"
  # `is-active` con retry: il restart è asincrono e lo status può essere
  # "activating" per qualche centinaio di ms.
  local i
  for i in $(seq 1 10); do
    if systemctl is-active --quiet "${SERVICE_NAME}"; then
      break
    fi
    sleep 1
  done
  if ! systemctl is-active --quiet "${SERVICE_NAME}"; then
    warn "il servizio ${SERVICE_NAME} non è attivo dopo il restart"
    journalctl -u "${SERVICE_NAME}" -n 30 --no-pager >&2 || true
    return 1
  fi
  ok "servizio ${SERVICE_NAME} riavviato su ${release}"
  wait_for_health
}

# Rollback: riporta `current` e il web root alla release precedente e riavvia.
do_rollback() {
  local fallback="$1"
  step "ROLLBACK verso ${fallback:-<nessuna release precedente>}"

  if [[ -z "${fallback}" || ! -d "${fallback}" ]]; then
    die "rollback impossibile: nessuna release precedente valida. Il sito resta sull'ultima release pubblicata.
   Azioni manuali consigliate:
     journalctl -u ${SERVICE_NAME} -n 100 --no-pager
     systemctl status ${SERVICE_NAME}
     curl -v ${HEALTH_URL}"
  fi

  switch_symlink "${fallback}" "${CURRENT_LINK}"
  prepare_web_link "${fallback}"
  if activate_release "${fallback}"; then
    warn "rollback COMPLETATO: in produzione c'è di nuovo ${fallback}"
    warn "il deploy corrente è fallito: indaga prima di ritentare"
    exit 1
  fi
  die "rollback FALLITO: anche la release precedente non passa l'healthcheck.
   Il sito potrebbe essere down: controlla 'journalctl -u ${SERVICE_NAME} -n 100'"
}


# -----------------------------------------------------------------------------
# 2. Controlli preliminari sulla struttura
# -----------------------------------------------------------------------------
step "Controllo della struttura di deploy"

[[ -d "${OPT_DIR}" ]] || die "${OPT_DIR} non esiste: esegui prima 'sudo bash scripts/install-ubuntu.sh'"
id -u "${APP_USER}" >/dev/null 2>&1 || die "utente ${APP_USER} inesistente: esegui prima install-ubuntu.sh"
[[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]] ||
  die "unit /etc/systemd/system/${SERVICE_NAME}.service mancante: esegui prima install-ubuntu.sh"

install -d -m 0755 -o "${APP_USER}" -g "${APP_GROUP}" "${RELEASES_DIR}"

# La release precedente (per il rollback) è quella puntata da `current` PRIMA
# di qualunque modifica: la registriamo subito.
PREVIOUS_RELEASE=""
if [[ -L "${CURRENT_LINK}" ]]; then
  PREVIOUS_RELEASE="$(readlink -f "${CURRENT_LINK}" || true)"
  if [[ -n "${PREVIOUS_RELEASE}" && -d "${PREVIOUS_RELEASE}" ]]; then
    ok "release precedente (per rollback): ${PREVIOUS_RELEASE}"
  else
    warn "symlink ${CURRENT_LINK} presente ma non valido: nessun rollback disponibile"
    PREVIOUS_RELEASE=""
  fi
else
  warn "primo deploy su questo host (nessuna release precedente da cui tornare)"
fi

# -----------------------------------------------------------------------------
# 3. Aggiornamento del codice (git) e build
# -----------------------------------------------------------------------------
COMMIT="${COMMIT:-unknown}"

if (( SKIP_GIT == 1 )); then
  warn "SKIP_GIT=1: uso i file già presenti in ${REPO_DIR} (nessun aggiornamento da git)"
  [[ -f "${REPO_DIR}/package.json" ]] || die "SKIP_GIT=1 ma ${REPO_DIR}/package.json non esiste"
else
  step "Aggiornamento del codice da git (${GIT_REMOTE}/${BRANCH})"
  [[ -d "${REPO_DIR}/.git" ]] ||
    die "${REPO_DIR} non è un repository git. Clonalo con:
   sudo -u ${APP_USER} git clone https://github.com/Maxster81/BingWLP.git ${REPO_DIR}
   oppure usa SKIP_GIT=1 se il codice è già lì."

  cd "${REPO_DIR}"

  # `-c safe.directory=...`: il repo è di ${APP_USER} ma i comandi girano come root.
  # Senza questo, git rifiuta di operare ("detected dubious ownership").
  GIT=(git -c "safe.directory=${REPO_DIR}")

  "${GIT[@]}" fetch --prune "${GIT_REMOTE}"
  # `reset --hard` sull'upstream è l'equivalente del "solo fast-forward"
  # (git pull --ff-only) ma più prevedibile in un deploy automatico: qualunque
  # modifica locale non committata viene scartata e lo stato è esattamente
  # quello remoto. Il contenuto puntato dal remoto è già validato dalla CI.
  "${GIT[@]}" checkout --force "${BRANCH}" 2>/dev/null ||
    "${GIT[@]}" checkout --force -B "${BRANCH}" "${GIT_REMOTE}/${BRANCH}"
  "${GIT[@]}" reset --hard "${GIT_REMOTE}/${BRANCH}"
  "${GIT[@]}" clean -fd -e node_modules

  COMMIT="$("${GIT[@]}" rev-parse --short HEAD)"
  COMMIT_SUBJECT="$("${GIT[@]}" log -1 --pretty=%s)"
  ok "codice aggiornato a ${COMMIT} — ${COMMIT_SUBJECT}"
fi

step "Installazione dipendenze (npm ci — complete, servono per la build)"
cd "${REPO_DIR}"
# `npm ci` cancella node_modules e reinstalla dal lockfile: build riproducibile.
# È volutamente COMPLETO (con devDependencies): tsup e vite servono per compilare.
npm ci --no-audit --no-fund
ok "dipendenze installate (Node $(node -v), npm $(npm -v))"

step "Build (web → web/dist, server → server/dist/index.js)"
npm run build
ok "build completata"

# Verifica degli artefatti: se mancano, meglio fallire ORA che dopo lo switch.
[[ -f "${REPO_DIR}/server/dist/index.js" ]] || die "artefatto mancante: server/dist/index.js"
[[ -f "${REPO_DIR}/web/dist/index.html" ]] || die "artefatto mancante: web/dist/index.html"
ok "artefatti verificati (server/dist/index.js, web/dist/index.html)"

if (( PRUNE == 1 )); then
  step "Pruning delle dipendenze di sviluppo (npm prune --omit=dev)"
  # Su un monorepo npm workspaces rimuove le devDependencies di TUTTI i workspace.
  # Riduce la release di centinaia di MB. Il bundle server è già compilato,
  # quindi la build non ne ha più bisogno (al prossimo deploy `npm ci` le rimette).
  npm prune --omit=dev --no-audit --no-fund
  ok "release alleggerita alle sole dipendenze runtime"
fi


# -----------------------------------------------------------------------------
# 4. Creazione della release immutabile
# -----------------------------------------------------------------------------
step "Creazione della release in ${RELEASES_DIR}"

RELEASE_NAME="${STAMP}-${COMMIT}"
RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"

# Guardia: non deve esistere (due deploy nello stesso secondo con lo stesso commit).
if [[ -e "${RELEASE_DIR}" ]]; then
  RELEASE_NAME="${STAMP}-${COMMIT}-$$"
  RELEASE_DIR="${RELEASES_DIR}/${RELEASE_NAME}"
fi
install -d -m 0755 -o "${APP_USER}" -g "${APP_GROUP}" "${RELEASE_DIR}"

# Copia con HARDLINK (`cp -al`): i file non vengono duplicati su disco, si
# condividono gli inode. La release resta immutabile perché nessun processo
# scrive quei file (il codice è read-only); se in futuro un file venisse
# sovrascritto in-place, il kernel creerebbe un nuovo inode e l'altra release
# non ne risentirebbe. Vantaggi: release in ~1s e rollback che non consuma spazio.
copy_tree() {
  local src="$1" dst="$2"
  if cp -al "${src}" "${dst}" 2>/dev/null; then
    return 0
  fi
  # Fallback (filesystem diversi, es. /opt su un mount separato): copia reale.
  warn "hardlink non disponibili per ${src}: uso copia completa (più lenta)"
  cp -a "${src}" "${dst}"
}

# Runtime del backend: manifest + bundle + dipendenze.
copy_tree "${REPO_DIR}/package.json" "${RELEASE_DIR}/package.json"
copy_tree "${REPO_DIR}/package-lock.json" "${RELEASE_DIR}/package-lock.json"
copy_tree "${REPO_DIR}/node_modules" "${RELEASE_DIR}/node_modules"
install -d -m 0755 "${RELEASE_DIR}/server"
copy_tree "${REPO_DIR}/server/package.json" "${RELEASE_DIR}/server/package.json"
copy_tree "${REPO_DIR}/server/dist" "${RELEASE_DIR}/server/dist"
# server/node_modules esiste solo se npm non ha potuto hoistare tutto: copiarlo
# quando c'è evita "Cannot find package" a runtime.
if [[ -d "${REPO_DIR}/server/node_modules" ]]; then
  copy_tree "${REPO_DIR}/server/node_modules" "${RELEASE_DIR}/server/node_modules"
fi

# Statico del frontend: serve sia al symlink nginx sia (se SERVE_STATIC=true) al backend.
install -d -m 0755 "${RELEASE_DIR}/web"
copy_tree "${REPO_DIR}/web/dist" "${RELEASE_DIR}/web/dist"

# Metadati della release: utili per capire "cosa gira ora" mesi dopo.
cat > "${RELEASE_DIR}/RELEASE" <<EOF
release=${RELEASE_NAME}
commit=${COMMIT}
branch=${BRANCH}
created_utc=${STAMP}
host=$(hostname -f 2>/dev/null || hostname)
node=$(node -v)
npm=$(npm -v)
EOF

# Ownership: il servizio gira come ${APP_USER} e deve poter leggere tutto.
# (chown -R non duplica i dati, agisce sugli inode condivisi con il repo.)
chown -R "${APP_USER}:${APP_GROUP}" "${RELEASE_DIR}"
chmod -R u=rX,g=rX,o= "${RELEASE_DIR}"
ok "release creata: ${RELEASE_DIR}"

# -----------------------------------------------------------------------------
# 5. Switch atomico dei symlink
# -----------------------------------------------------------------------------
step "Pubblicazione atomica (symlink current + web root)"

# 5a. `current` → nuova release. Da questo istante la unit systemd (drop-in
# 10-release.conf) lavora sulla nuova release al prossimo restart.
switch_symlink "${RELEASE_DIR}" "${CURRENT_LINK}"
ok "${CURRENT_LINK} → ${RELEASE_DIR}"

# 5b. web root di nginx → <release>/web/dist. Gli asset sono già al loro posto
# PRIMA del restart del backend: nginx non serve mai file di un build misto.
prepare_web_link "${RELEASE_DIR}"
ok "${WEB_LINK} → ${RELEASE_DIR}/web/dist"

# -----------------------------------------------------------------------------
# 6. Restart + healthcheck (con rollback automatico)
# -----------------------------------------------------------------------------
step "Riavvio del servizio e healthcheck"

# Assicura che il servizio sia abilitato al boot (idempotente).
systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1 || warn "systemctl enable fallito (non bloccante)"

if activate_release "${RELEASE_DIR}"; then
  ok "deploy di ${RELEASE_NAME} completato con successo"
else
  warn "il servizio non è sano sulla nuova release: avvio il rollback automatico"
  do_rollback "${PREVIOUS_RELEASE}"
fi

# -----------------------------------------------------------------------------
# 7. Retention delle release
# -----------------------------------------------------------------------------
step "Pulizia delle release precedenti (mantengo le ultime ${KEEP_RELEASES})"

# `ls -1dt` ordina per mtime decrescente (la più recente per prima).
# `tail -n +N` salta le prime (N-1) release da mantenere.
mapfile -t all_releases < <(ls -1dt "${RELEASES_DIR}"/*/ 2>/dev/null || true)
removed=0
for (( i = KEEP_RELEASES; i < ${#all_releases[@]}; i++ )); do
  victim="${all_releases[$i]}"
  victim="${victim%/}"
  # Mai cancellare la release attiva o quella di rollback.
  if [[ "${victim}" == "${RELEASE_DIR}" ]]; then
    continue
  fi
  if [[ -n "${PREVIOUS_RELEASE}" && "${victim}" == "${PREVIOUS_RELEASE}" ]] && (( KEEP_RELEASES <= 1 )); then
    continue
  fi
  rm -rf -- "${victim}"
  ok "release rimossa: ${victim}"
  removed=$(( removed + 1 ))
done
# NB: NON usare `(( removed == 0 )) && ok ...`: con `set -e` un'aritmetica che
# ritorna 1 (falso) fa terminare lo script senza stampare il riepilogo.
if (( removed == 0 )); then
  ok "nessuna release da rimuovere"
fi


# -----------------------------------------------------------------------------
# 8. Riepilogo finale
# -----------------------------------------------------------------------------
step "Deploy completato"

SERVICE_STATE="$(systemctl is-active "${SERVICE_NAME}" 2>/dev/null || echo sconosciuto)"
UPTIME_JSON="$(curl -fsS --max-time 5 "${HEALTH_URL}" 2>/dev/null || echo '{"status":"non raggiungibile"}')"

cat <<EOF

  Riepilogo deploy
  ----------------
  Release attiva ...... ${RELEASE_NAME}
  Commit .............. ${COMMIT} (branch ${BRANCH})
  Directory release ... ${RELEASE_DIR}
  Symlink current ..... $(readlink -f "${CURRENT_LINK}" 2>/dev/null || echo 'assente')
  Web root nginx ...... ${WEB_LINK} → $(readlink -f "${WEB_LINK}" 2>/dev/null || echo 'assente')
  Servizio ............ ${SERVICE_NAME}: ${SERVICE_STATE}
  Healthcheck ......... ${HEALTH_URL}
                        ${UPTIME_JSON}
  Release mantenute ... $(ls -1d "${RELEASES_DIR}"/*/ 2>/dev/null | wc -l) (retention: ${KEEP_RELEASES})
  Release precedente .. ${PREVIOUS_RELEASE:-nessuna}

  Comandi utili
  -------------
  Log in tempo reale ...... journalctl -u ${SERVICE_NAME} -f
  Stato servizio .......... systemctl status ${SERVICE_NAME}
  Verifica pubblica ....... curl -I https://<dominio>/
  API health .............. curl -fsS http://127.0.0.1:8080/api/health | python3 -m json.tool
  Rollback manuale ........ sudo ln -sfn ${PREVIOUS_RELEASE:-<release>} ${CURRENT_LINK} \\
                            && sudo ln -sfn ${PREVIOUS_RELEASE:-<release>}/web/dist ${WEB_LINK} \\
                            && sudo systemctl restart ${SERVICE_NAME}
  Elenco release .......... ls -1dt ${RELEASES_DIR}/*/
EOF

ok "tutto a posto: ${RELEASE_NAME} è in produzione"

