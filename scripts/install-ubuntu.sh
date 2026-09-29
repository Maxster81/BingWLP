#!/usr/bin/env bash
# =============================================================================
# BingWLP — install-ubuntu.sh
# =============================================================================
# Prepara un server Ubuntu LTS recente PULITO (testato: 22.04 / 24.04 / 26.04)
# nginx + systemd (la variante Docker non richiede questo script).
#
# COSA FA (tutto IDEMPOTENTE: si può rieseguire senza danni)
#   1. controlla root e che l'OS sia una Ubuntu LTS supportata
#   2. apt update + pacchetti base: nginx, curl, ca-certificates, gnupg, git, logrotate
#   3. installa Node.js 20 LTS dal repository NodeSource
#   4. crea l'utente di sistema `bingwlp` e le cartelle di deploy
#   5. installa unit systemd (+ drop-in atomico), env di esempio, config nginx
#      e regola logrotate, se presenti nel repo
#   6. attiva il firewall ufw con 80/443 (e OpenSSH, per non chiudersi fuori)
#   7. stampa i prossimi passi
#
# USO
#   sudo bash scripts/install-ubuntu.sh           # dal repo clonato
#   sudo bash scripts/install-ubuntu.sh --no-ufw  # non attivare ufw
#
# NON fa: il primo deploy del codice (usa scripts/deploy.sh o i comandi in
# docs/DEPLOY.md) e NON configura il TLS (lo fa certbot, vedi DEPLOY.md).
# =============================================================================

# -----------------------------------------------------------------------------
# Modalità shell sicura
# -----------------------------------------------------------------------------
# -E: il trap ERR vale anche dentro funzioni e subshell
# -e: esci al primo comando fallito
# -u: una variabile non definita è un errore (evita rm -rf "$VAR" vuota)
# -o pipefail: il fallimento di un comando in pipe non è mascherato dall'ultimo
set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Costanti / argomenti
# -----------------------------------------------------------------------------
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

APP_USER="${APP_USER:-bingwlp}"
APP_GROUP="${APP_GROUP:-${APP_USER}}"
SERVICE_NAME="${SERVICE_NAME:-bingwlp}"

# Percorsi di deploy (devono combaciare con deploy/systemd/bingwlp.service
# e deploy/nginx/bingwlp.conf).
OPT_DIR="${OPT_DIR:-/opt/bingwlp}"
ETC_DIR="${ETC_DIR:-/etc/bingwlp}"
LOG_DIR="${LOG_DIR:-/var/log/bingwlp}"
LIB_DIR="${LIB_DIR:-/var/lib/bingwlp}"
WEB_DIR="${WEB_DIR:-/var/www/bingwlp}"
WEB_ROOT="${WEB_ROOT:-${WEB_DIR}/web/dist}"
RELEASES_DIR="${RELEASES_DIR:-${OPT_DIR}/releases}"

NODE_MAJOR="${NODE_MAJOR:-20}"
ENABLE_UFW="${ENABLE_UFW:-1}"

# Timestamp UTC per i backup dei file già presenti.
STAMP="$(date -u +%Y%m%d-%H%M%S)"

# Argomenti da riga di comando.
for arg in "$@"; do
  case "${arg}" in
    --no-ufw) ENABLE_UFW=0 ;;
    --help | -h)
      sed -n '2,24p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      echo "Argomento non riconosciuto: ${arg}" >&2
      echo "Uso: sudo bash scripts/install-ubuntu.sh [--no-ufw]" >&2
      exit 2
      ;;
  esac
done

# -----------------------------------------------------------------------------
# Output leggibile
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

# Trap di errore: mostra la riga che ha fallito (lo script si ferma comunque).
# Deve stare QUI, dopo le definizioni di die() e prima dei comandi, così vale
# già per i controlli dei prerequisiti e per tutti i comandi successivi.
trap 'die "comando fallito alla riga ${LINENO}: ${BASH_COMMAND}"' ERR

# -----------------------------------------------------------------------------
# 1. Requisiti: root e distribuzione
# -----------------------------------------------------------------------------
step "Controllo prerequisiti"

[[ "${EUID}" -eq 0 ]] || die "serve root: esegui con 'sudo bash $0'"

[[ -r /etc/os-release ]] || die "/etc/os-release mancante: OS non riconosciuto"
# shellcheck source=/dev/null
. /etc/os-release
[[ "${ID:-}" == "ubuntu" ]] || die "distribuzione non supportata: atteso Ubuntu, trovato '${ID:-?}'"
case "${VERSION_ID:-}" in
  # Versioni esplicitamente testate. La procedura e' generica (apt, NodeSource
  # nodistro, systemd): su altre Ubuntu LTS recenti si prosegue con un warning.
  22.04 | 24.04 | 26.04) ok "Ubuntu ${VERSION_ID} (${PRETTY_NAME:-})" ;;
  *) warn "Ubuntu ${VERSION_ID:-sconosciuta} non testata esplicitamente (testate: 22.04/24.04/26.04); si prosegue comunque" ;;
esac

# apt non interattivo: nessuna domanda su file di configurazione modificati,
# così un re-run su un server già configurato non si blocca.
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=l
export APT_LISTCHANGES_FRONTEND=none

# -----------------------------------------------------------------------------
# 2. Pacchetti di base
# -----------------------------------------------------------------------------
step "Aggiornamento elenchi pacchetti"
apt-get update -y
ok "apt-get update"

# NB: NON serve build-essential. Il progetto non ha moduli nativi da compilare
# (Fastify, zod, React e Vite sono JS puri) e il runtime Node arriva da NodeSource.
step "Installazione pacchetti base (nginx, git, curl, gnupg, logrotate)"
apt-get install -y --no-install-recommends \
  nginx \
  git \
  curl \
  ca-certificates \
  gnupg \
  logrotate
ok "pacchetti base installati"

# -----------------------------------------------------------------------------
# 3. Node.js 20 LTS da NodeSource
# -----------------------------------------------------------------------------
step "Installazione Node.js ${NODE_MAJOR} (NodeSource)"

# Idempotenza: se c'è già un Node >= richiesto non tocchiamo nulla, per non
# retrocedere un runtime più nuovo eventualmente già presente.
install_node=0
if command -v node >/dev/null 2>&1; then
  current_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [[ "${current_major}" =~ ^[0-9]+$ ]] && (( current_major >= NODE_MAJOR )); then
    ok "Node $(node -v) già presente (>= ${NODE_MAJOR}): nessuna azione"
  else
    warn "Node $(node -v 2>/dev/null || echo assente) < ${NODE_MAJOR}: procedo con NodeSource"
    install_node=1
  fi
else
  install_node=1
fi

if (( install_node == 1 )); then
  install -d -m 0755 /usr/share/keyrings
  # Chiave GPG di NodeSource "dearmorata": apt verifica la firma dei pacchetti.
  curl -fsSL "https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key" \
    | gpg --dearmor --yes -o /usr/share/keyrings/nodesource.gpg
  chmod 0644 /usr/share/keyrings/nodesource.gpg

  # Repository `nodistro`: pacchetto unico e più aggiornato di `node_20.x`.
  printf 'deb [signed-by=/usr/share/keyrings/nodesource.gpg] https://deb.nodesource.com/node_%s.x nodistro main\n' \
    "${NODE_MAJOR}" > /etc/apt/sources.list.d/nodesource.list

  apt-get update -y
  apt-get install -y nodejs
  ok "Node $(node -v) — npm $(npm -v)"
fi

# Sanity check finale: qualunque sia il percorso, la versione deve essere ok.
node_major="$(node -p 'process.versions.node.split(".")[0]')"
(( node_major >= NODE_MAJOR )) || die "Node ${node_major} < ${NODE_MAJOR}: installazione non riuscita"

# -----------------------------------------------------------------------------
# 4. Utente di sistema e cartelle di deploy
# -----------------------------------------------------------------------------
step "Utente di sistema e cartelle"

# Utente di sistema: niente password, niente login, home = /opt/bingwlp.
# Idempotente: se esiste già non viene toccato (né ricreato né modificato).
if id -u "${APP_USER}" >/dev/null 2>&1; then
  ok "utente ${APP_USER} già presente (uid $(id -u "${APP_USER}"))"
else
  useradd --system --create-home --home-dir "${OPT_DIR}" \
    --shell /usr/sbin/nologin --comment "BingWLP service account" "${APP_USER}"
  ok "utente di sistema ${APP_USER} creato (uid $(id -u "${APP_USER}"))"
fi

# Cartelle di deploy. `install -d` è idempotente e imposta i permessi ogni volta.
#   /opt/bingwlp            codice (repo o `current` symlink)
#   /opt/bingwlp/releases   release immutabili del deploy atomico
#   /etc/bingwlp            file env (contiene eventuali segreti → 0750)
#   /var/log/bingwlp        log (0730: solo root e il servizio)
#   /var/lib/bingwlp        UNICA cartella scrivibile dal servizio (ProtectSystem=strict)
#   /var/www/bingwlp/web/dist  statico servito da nginx
install -d -m 0755 -o "${APP_USER}" -g "${APP_GROUP}" "${OPT_DIR}"
install -d -m 0755 -o "${APP_USER}" -g "${APP_GROUP}" "${RELEASES_DIR}"
install -d -m 0750 -o root -g "${APP_GROUP}" "${ETC_DIR}"
install -d -m 0730 -o root -g "${APP_GROUP}" "${LOG_DIR}"
install -d -m 0750 -o "${APP_USER}" -g "${APP_GROUP}" "${LIB_DIR}"
install -d -m 0750 -o "${APP_USER}" -g "${APP_GROUP}" "${LIB_DIR}/images"
install -d -m 0755 -o root -g root "${WEB_DIR}"
install -d -m 0755 -o root -g root "${WEB_DIR}/web"
ok "cartelle create/aggiornate: ${OPT_DIR} ${ETC_DIR} ${LOG_DIR} ${LIB_DIR} ${WEB_DIR}"

# Placeholder: prima del primo deploy nginx avrebbe una `root` inesistente e
# risponderebbe 500 senza spiegazioni. Creiamo una index.html segnaposto.
# scripts/deploy.sh la sostituirà con un symlink al build reale (rimuovendo
# questa directory di appoggio).
if [[ ! -e "${WEB_ROOT}" ]]; then
  install -d -m 0755 -o root -g root "${WEB_ROOT}"
  cat > "${WEB_ROOT}/index.html" <<'HTML'
<!doctype html>
<html lang="it"><head><meta charset="utf-8"><title>BingWLP &mdash; non ancora deployata</title></head>
<body style="font-family:system-ui;max-width:40rem;margin:4rem auto;padding:0 1rem">
<h1>BingWLP</h1>
<p>Il server web &egrave; configurato, ma il frontend non &egrave; ancora stato pubblicato.</p>
<p>Esegui <code>scripts/deploy.sh</code> sulla root del repository.</p>
</body></html>
HTML
  chmod 0644 "${WEB_ROOT}/index.html"
  ok "creato segnaposto ${WEB_ROOT}/index.html"
else
  ok "${WEB_ROOT} già presente: lasciato invariato"
fi

# env: copia del modello SOLO se non esiste già (non sovrascrive mai una config viva).
if [[ ! -f "${ETC_DIR}/bingwlp.env" ]]; then
  if [[ -f "${REPO_ROOT}/deploy/bingwlp.env.example" ]]; then
    install -m 0640 -o root -g "${APP_GROUP}" \
      "${REPO_ROOT}/deploy/bingwlp.env.example" "${ETC_DIR}/bingwlp.env"
    ok "creato ${ETC_DIR}/bingwlp.env dal modello (da personalizzare)"
  else
    warn "modello ${REPO_ROOT}/deploy/bingwlp.env.example non trovato: crea ${ETC_DIR}/bingwlp.env a mano"
  fi
else
  ok "${ETC_DIR}/bingwlp.env già presente: lasciato invariato"
fi


# -----------------------------------------------------------------------------
# 5. Configurazione dei servizi (systemd, nginx, logrotate)
# -----------------------------------------------------------------------------
step "Installazione configurazioni (systemd / nginx / logrotate)"

install_if_present() {
  # install_if_present <sorgente-nel-repo> <destinazione> <modalita> <owner:group>
  local src="$1" dst="$2" mode="$3" owner="$4"
  if [[ ! -f "${src}" ]]; then
    warn "file non trovato nel repo: ${src} (saltato)"
    return 0
  fi
  # Backup del file già presente se diverso, così un re-run non distrugge
  # modifiche locali fatte a mano sul server.
  if [[ -f "${dst}" ]] && ! cmp -s "${src}" "${dst}"; then
    cp -a "${dst}" "${dst}.bak-${STAMP}"
    warn "backup della versione precedente: ${dst}.bak-${STAMP}"
  fi
  install -m "${mode}" -o "${owner%%:*}" -g "${owner##*:}" "${src}" "${dst}"
  ok "installato ${dst}"
}

# --- systemd: unit base + drop-in per il deploy atomico ---------------------
install_if_present "${REPO_ROOT}/deploy/systemd/bingwlp.service" \
  "/etc/systemd/system/${SERVICE_NAME}.service" 0644 root:root

if [[ -f "${REPO_ROOT}/deploy/systemd/bingwlp.service.d/10-release.conf" ]]; then
  install -d -m 0755 "/etc/systemd/system/${SERVICE_NAME}.service.d"
  install_if_present "${REPO_ROOT}/deploy/systemd/bingwlp.service.d/10-release.conf" \
    "/etc/systemd/system/${SERVICE_NAME}.service.d/10-release.conf" 0644 root:root
fi

systemctl daemon-reload
# NB: NON abilitiamo/avviamo il servizio qui: senza /opt/bingwlp/server/dist/index.js
# il processo partirebbe in crash-loop. Il `enable` lo fa scripts/deploy.sh dopo
# aver pubblicato la prima release. Abilitarlo comunque (senza avviarlo) è utile
# perché sopravviva ai reboot appena il deploy lo avvia:
systemctl enable "${SERVICE_NAME}" >/dev/null 2>&1 || true
ok "unit ${SERVICE_NAME}.service installata e abilitata (non avviata)"

# --- nginx: server block dedicato + rimozione del sito di default -----------
if [[ -f "${REPO_ROOT}/deploy/nginx/bingwlp.conf" ]]; then
  install_if_present "${REPO_ROOT}/deploy/nginx/bingwlp.conf" \
    "/etc/nginx/sites-available/${SERVICE_NAME}.conf" 0644 root:root
  ln -sfn "/etc/nginx/sites-available/${SERVICE_NAME}.conf" \
    "/etc/nginx/sites-enabled/${SERVICE_NAME}.conf"

  # Il sito di default di Ubuntu occupa la porta 80 come default_server: con
  # il nostro server_name esplicito non ci sarebbero conflitti, ma lasciarlo
  # significa esporre una pagina di cortesia indesiderata. Lo disattiviamo.
  if [[ -e /etc/nginx/sites-enabled/default ]]; then
    rm -f /etc/nginx/sites-enabled/default
    ok "disattivato il sito nginx di default"
  fi

  # `nginx -t` PRIMA del reload: se la config è rotta, nginx resta su quella
  # vecchia (in produzione significa zero downtime per un errore di sintassi).
  if nginx -t; then
    systemctl reload nginx
    ok "nginx: configurazione valida, ricaricato"
  else
    warn "nginx -t fallito: nginx NON è stato ricaricato. Controlla il server_name"
    warn "in /etc/nginx/sites-available/${SERVICE_NAME}.conf e riprova con: nginx -t"
  fi
else
  warn "deploy/nginx/bingwlp.conf non trovato: nginx non configurato"
fi

# --- logrotate --------------------------------------------------------------
if [[ -f "${REPO_ROOT}/deploy/logrotate/bingwlp" ]]; then
  install_if_present "${REPO_ROOT}/deploy/logrotate/bingwlp" \
    "/etc/logrotate.d/${SERVICE_NAME}" 0644 root:root
fi


# -----------------------------------------------------------------------------
# 6. Firewall (ufw)
# -----------------------------------------------------------------------------
if (( ENABLE_UFW == 1 )); then
  step "Configurazione firewall (ufw)"
  if ! command -v ufw >/dev/null 2>&1; then
    apt-get install -y --no-install-recommends ufw
  fi

  # ORDINE IMPORTANTE: prima SSH. Attivare ufw senza la regola per la 22
  # significa perdere l'accesso al server (soprattutto su VPS remote).
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || warn "regola SSH non aggiunta: verifica manualmente"
  ufw allow 80/tcp  >/dev/null 2>&1 || warn "regola 80/tcp non aggiunta"
  ufw allow 443/tcp >/dev/null 2>&1 || warn "regola 443/tcp non aggiunta"

  # Policy di default: nega tutto in ingresso, permetti tutto in uscita
  # (serve per raggiungere services.bingapis.com e il CDN Bing).
  ufw default deny incoming >/dev/null 2>&1 || true
  ufw default allow outgoing >/dev/null 2>&1 || true

  if ufw status | grep -q "Status: active"; then
    ok "ufw già attivo: regole aggiornate"
  else
    # `--force` risponde automaticamente "y" al prompt di abilitazione.
    ufw --force enable >/dev/null 2>&1
    ok "ufw attivato (22/tcp, 80/tcp, 443/tcp)"
  fi
  ufw status verbose | sed 's/^/     /'
else
  warn "firewall non configurato (--no-ufw / ENABLE_UFW=0): assicurati che 80 e 443 siano aperti"
fi

# -----------------------------------------------------------------------------
# 7. Riepilogo e prossimi passi
# -----------------------------------------------------------------------------
step "Installazione completata"
cat <<EOF

  Riepilogo ambiente
  ------------------
  Utente servizio ....... ${APP_USER} (uid $(id -u "${APP_USER}"))
  Node ................. $(node -v)   npm $(npm -v)
  nginx ................ $(nginx -v 2>&1 | sed 's/^nginx version: //')
  Unit systemd .......... /etc/systemd/system/${SERVICE_NAME}.service
  Drop-in atomico ....... /etc/systemd/system/${SERVICE_NAME}.service.d/10-release.conf
  Config nginx .......... /etc/nginx/sites-available/${SERVICE_NAME}.conf
  Env ................... ${ETC_DIR}/bingwlp.env   (${C_YELLOW}DA PERSONALIZZARE: server_name, HOST, PORT${C_RESET})
  Cartelle .............. ${OPT_DIR}  ${ETC_DIR}  ${LOG_DIR}  ${LIB_DIR}  ${WEB_DIR}

  Prossimi passi (in ordine)
  --------------------------
  1. Personalizza la config nginx (dominio) e ricarica:
       sudo nano /etc/nginx/sites-available/${SERVICE_NAME}.conf
       sudo nginx -t && sudo systemctl reload nginx
  2. Rivedi le variabili d'ambiente:
       sudo nano ${ETC_DIR}/bingwlp.env
     (HOST=127.0.0.1, PORT=8080, SERVE_STATIC=false, NODE_ENV=production)
  3. Porta il codice nel percorso di deploy (esempio con git):
       sudo -u ${APP_USER} git clone https://github.com/Maxster81/BingWLP.git ${OPT_DIR}/repo
     oppure copia il repo con rsync/scp. Per il deploy atomico la root di lavoro
     e' ${OPT_DIR}/repo e le release finiscono in ${RELEASES_DIR}.
  4. Fai il primo deploy (build + pubblicazione + restart + healthcheck):
       cd ${OPT_DIR}/repo && sudo bash scripts/deploy.sh
  5. Verifica:
       systemctl status ${SERVICE_NAME}
       journalctl -u ${SERVICE_NAME} -n 50 --no-pager
       curl -fsS http://127.0.0.1:8080/api/health
       curl -I http://<dominio>/          # atteso 200 e header Cache-Control
  6. Aggiungi il TLS (dopo che il DNS punta a questo server):
       sudo apt-get install -y python3-certbot-nginx
       sudo certbot --nginx -d <dominio> -d www.<dominio>
     Il rinnovo e' automatico via systemd timer: verifica con
       sudo certbot renew --dry-run

  Guida completa: docs/DEPLOY.md
EOF

