#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Forge — Server Provisioning Script
# Targets: Ubuntu 24.04+
# Supports multi-project, multi-environment on a single server.
# Identity: APP_NAME + ENVIRONMENT = unique APP_ID
# Usage: sudo bash scripts/setup.sh
# =============================================================================

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd 2>/dev/null || echo "")"
readonly SYSTEMD_DEST="/etc/systemd/system"
readonly SYS_USER="forge"

# ---------------------------------------------------------------------------
# Color codes & helpers
# ---------------------------------------------------------------------------
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

ask() {
    local prompt="$1"
    local default="${2:-}"
    local reply
    if [[ -n "${default}" ]]; then
        read -rp "$(echo -e "${BLUE}[?]${NC} ${prompt} [${default}]: ")" reply
        echo "${reply:-${default}}"
    else
        read -rp "$(echo -e "${BLUE}[?]${NC} ${prompt}: ")" reply
        echo "${reply}"
    fi
}

ask_secret() {
    local prompt="$1"
    local reply
    read -srp "$(echo -e "${BLUE}[?]${NC} ${prompt}: ")" reply
    echo >&2
    echo "${reply}"
}

ask_yn() {
    local prompt="$1"
    local default="${2:-n}"
    local hint
    if [[ "${default}" == "y" ]]; then hint="Y/n"; else hint="y/N"; fi
    local reply
    read -rp "$(echo -e "${BLUE}[?]${NC} ${prompt} (${hint}): ")" reply
    reply="${reply:-${default}}"
    [[ "${reply}" =~ ^[Yy] ]]
}

is_installed() { command -v "$1" &>/dev/null; }
is_service_active() { systemctl is-active --quiet "$1" 2>/dev/null; }
is_service_enabled() { systemctl is-enabled --quiet "$1" 2>/dev/null; }

header() {
    echo ""
    echo -e "${BLUE}=== $* ===${NC}"
    echo ""
}

to_underscore() { echo "${1//-/_}"; }

# ---------------------------------------------------------------------------
# Collected state
# ---------------------------------------------------------------------------
SUMMARY_DATABASE_URL=""
SUMMARY_REDIS_URL=""
SUMMARY_APP_KEY=""
SUMMARY_CRYPT_KEY=""
SUMMARY_DOMAIN=""
SUMMARY_HTTP_PORT="3000"
SUMMARY_WS_PORT="3010"
SKIP_DEPLOY_POLL=false

# =============================================================================
# 1. System check
# =============================================================================
header "System Check"

if [[ "${EUID}" -ne 0 ]]; then
    error "This script must be run as root (or with sudo)."
    exit 1
fi
ok "Running as root."

if ! is_installed lsb_release; then
    error "lsb_release not found. This script only supports Ubuntu 24.04+."
    exit 1
fi

DISTRO_ID="$(lsb_release -si)"
DISTRO_VERSION="$(lsb_release -sr)"

if [[ "${DISTRO_ID}" != "Ubuntu" ]]; then
    error "Unsupported distribution: ${DISTRO_ID}. Only Ubuntu supported."
    exit 1
fi

MAJOR_VERSION="${DISTRO_VERSION%%.*}"
if [[ "${MAJOR_VERSION}" -lt 24 ]]; then
    error "Ubuntu ${DISTRO_VERSION} is not supported. Minimum: 24.04."
    exit 1
fi
ok "Ubuntu ${DISTRO_VERSION} detected."

# =============================================================================
# 2. App identity
# =============================================================================
header "App Identity"

DEFAULT_APP_NAME=""
APP_TOML="${PROJECT_ROOT}/config/app.toml"
if [[ -n "${PROJECT_ROOT}" && -f "${APP_TOML}" ]]; then
    DEFAULT_APP_NAME="$(grep -oP '^\s*name\s*=\s*"\K[^"]+' "${APP_TOML}" 2>/dev/null || true)"
fi

APP_NAME="$(ask "App name" "${DEFAULT_APP_NAME}")"
if [[ -z "${APP_NAME}" ]]; then
    error "App name cannot be empty."
    exit 1
fi

ENVIRONMENT="$(ask "Environment (staging/production)" "production")"
if [[ "${ENVIRONMENT}" != "staging" && "${ENVIRONMENT}" != "production" ]]; then
    error "Environment must be 'staging' or 'production'."
    exit 1
fi

DOMAIN="$(ask "Domain for this app (e.g. staging.my-saas.com)" "")"
SUMMARY_DOMAIN="${DOMAIN}"

APP_ID="${APP_NAME}-${ENVIRONMENT}"
APP_DIR="/opt/${APP_ID}"
BINARY_NAME="app"
DB_USER="$(to_underscore "${APP_NAME}")"
DB_NAME="$(to_underscore "${APP_NAME}")_${ENVIRONMENT}"
REDIS_NAMESPACE="$(to_underscore "${APP_NAME}")_${ENVIRONMENT}"

# ---------------------------------------------------------------------------
# Load existing config as defaults (for re-runs)
# ---------------------------------------------------------------------------
EXISTING_DATABASE_URL=""
EXISTING_REDIS_URL=""
EXISTING_APP_KEY=""
EXISTING_CRYPT_KEY=""
EXISTING_APP_ENV=""
EXISTING_SERVER_PORT=""
EXISTING_WS_PORT=""
EXISTING_POLL_INTERVAL=""
EXISTING_DEPLOY_BUCKET=""
EXISTING_DEPLOY_REGION=""
EXISTING_DEPLOY_ENDPOINT=""

if [[ -f "${APP_DIR}/.env" ]]; then
    info "Found existing .env at ${APP_DIR}/.env — loading as defaults."
    EXISTING_DATABASE_URL="$(grep -oP '^DATABASE__URL=\K.*' "${APP_DIR}/.env" 2>/dev/null || grep -oP '^DATABASE_URL=\K.*' "${APP_DIR}/.env" 2>/dev/null || true)"
    EXISTING_REDIS_URL="$(grep -oP '^REDIS__URL=\K.*' "${APP_DIR}/.env" 2>/dev/null || grep -oP '^REDIS_URL=\K.*' "${APP_DIR}/.env" 2>/dev/null || true)"
    EXISTING_APP_KEY="$(grep -oP '^APP__SIGNING_KEY=\K.*' "${APP_DIR}/.env" 2>/dev/null || grep -oP '^APP_KEY=\K.*' "${APP_DIR}/.env" 2>/dev/null || true)"
    EXISTING_CRYPT_KEY="$(grep -oP '^CRYPT__KEY=\K.*' "${APP_DIR}/.env" 2>/dev/null || true)"
    EXISTING_APP_ENV="$(grep -oP '^APP__ENVIRONMENT=\K.*' "${APP_DIR}/.env" 2>/dev/null || grep -oP '^APP_ENV=\K.*' "${APP_DIR}/.env" 2>/dev/null || true)"
    EXISTING_SERVER_PORT="$(grep -oP '^SERVER__PORT=\K.*' "${APP_DIR}/.env" 2>/dev/null || true)"
    EXISTING_WS_PORT="$(grep -oP '^WEBSOCKET__PORT=\K.*' "${APP_DIR}/.env" 2>/dev/null || true)"
    EXISTING_DEPLOY_BUCKET="$(grep -oP '^DEPLOY_BUCKET=\K.*' "${APP_DIR}/.env" 2>/dev/null || true)"
    EXISTING_DEPLOY_REGION="$(grep -oP '^DEPLOY_REGION=\K.*' "${APP_DIR}/.env" 2>/dev/null || true)"
    EXISTING_DEPLOY_ENDPOINT="$(grep -oP '^DEPLOY_ENDPOINT=\K.*' "${APP_DIR}/.env" 2>/dev/null || true)"

    # Extract DB user/name/pass from existing DATABASE_URL for PostgreSQL prompts
    # Format: postgres://user:pass@host:port/dbname
    if [[ -n "${EXISTING_DATABASE_URL}" ]]; then
        DB_USER="$(echo "${EXISTING_DATABASE_URL}" | sed -n 's|postgres://\([^:]*\):.*|\1|p')"
        DB_NAME="$(echo "${EXISTING_DATABASE_URL}" | sed -n 's|.*/\([^?]*\).*|\1|p')"
    fi
fi

if [[ -f "${APP_DIR}/config/deploy.conf" ]]; then
    EXISTING_POLL_INTERVAL="$(grep -oP '^POLL_INTERVAL="\K[^"]+' "${APP_DIR}/config/deploy.conf" 2>/dev/null || true)"
    EXISTING_DEPLOY_BUCKET="${EXISTING_DEPLOY_BUCKET:-$(grep -oP '^DEPLOY_BUCKET="\K[^"]+' "${APP_DIR}/config/deploy.conf" 2>/dev/null || true)}"
    EXISTING_DEPLOY_REGION="${EXISTING_DEPLOY_REGION:-$(grep -oP '^DEPLOY_REGION="\K[^"]+' "${APP_DIR}/config/deploy.conf" 2>/dev/null || true)}"
    EXISTING_DEPLOY_ENDPOINT="${EXISTING_DEPLOY_ENDPOINT:-$(grep -oP '^DEPLOY_ENDPOINT="\K[^"]+' "${APP_DIR}/config/deploy.conf" 2>/dev/null || true)}"
fi

echo ""
info "App Name:     ${APP_NAME}"
info "Environment:  ${ENVIRONMENT}"
info "App ID:       ${APP_ID}"
info "App Dir:      ${APP_DIR}"
info "Domain:       ${DOMAIN:-<none>}"
if [[ -f "${APP_DIR}/.env" ]]; then
    ok "Re-run detected — existing values will be used as defaults."
fi
echo ""

# =============================================================================
# 3. System dependencies
# =============================================================================
header "System Dependencies"

info "Updating apt cache..."
apt-get update -qq
ok "Apt cache updated."

SYSTEM_PACKAGES=(build-essential curl wget unzip jq openssl ca-certificates gnupg)
MISSING_PACKAGES=()
for pkg in "${SYSTEM_PACKAGES[@]}"; do
    if dpkg -s "${pkg}" &>/dev/null; then
        ok "${pkg} installed."
    else
        MISSING_PACKAGES+=("${pkg}")
    fi
done

if [[ ${#MISSING_PACKAGES[@]} -gt 0 ]]; then
    info "Installing: ${MISSING_PACKAGES[*]}"
    apt-get install -y -qq "${MISSING_PACKAGES[@]}"
    ok "System dependencies installed."
else
    ok "All system dependencies present."
fi

# =============================================================================
# 4. System user
# =============================================================================
header "System User"

if id "${SYS_USER}" &>/dev/null; then
    ok "System user '${SYS_USER}' exists."
else
    useradd --system --shell /usr/sbin/nologin --create-home --home-dir "/home/${SYS_USER}" "${SYS_USER}"
    ok "System user '${SYS_USER}' created."
fi

# =============================================================================
# 5. PostgreSQL 16
# =============================================================================
header "PostgreSQL 16"

if dpkg -s postgresql-16 &>/dev/null; then
    ok "PostgreSQL 16 already installed."
else
    info "Adding PostgreSQL official apt repository..."
    install -d /usr/share/postgresql-common/pgdg
    curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
        -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
    echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list
    apt-get update -qq
    apt-get install -y -qq postgresql-16
    ok "PostgreSQL 16 installed."
fi

if ! is_service_enabled postgresql; then systemctl enable postgresql; fi
if ! is_service_active postgresql; then
    systemctl start postgresql
    ok "PostgreSQL started."
else
    ok "PostgreSQL running."
fi

# If we have an existing DATABASE_URL, use it and skip credential prompts
if [[ -n "${EXISTING_DATABASE_URL}" ]]; then
    info "Using existing DATABASE_URL from .env."
    SUMMARY_DATABASE_URL="${EXISTING_DATABASE_URL}"

    # Still create user/db if they don't exist (idempotent)
    USER_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" 2>/dev/null || true)
    if [[ "${USER_EXISTS}" == "1" ]]; then
        ok "User '${DB_USER}' exists."
    else
        info "User '${DB_USER}' not found — creating from DATABASE_URL."
        DB_PASS="$(echo "${EXISTING_DATABASE_URL}" | sed -n 's|postgres://[^:]*:\([^@]*\)@.*|\1|p')"
        sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';" >/dev/null
        ok "User '${DB_USER}' created."
    fi

    DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null || true)
    if [[ "${DB_EXISTS}" == "1" ]]; then
        ok "Database '${DB_NAME}' exists."
    else
        sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" >/dev/null
        ok "Database '${DB_NAME}' created."
    fi
else
    # First run — ask for credentials
    DB_USER="$(ask "PostgreSQL username" "${DB_USER}")"
    DB_NAME="$(ask "Database name" "${DB_NAME}")"

    USER_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" 2>/dev/null || true)

    if [[ "${USER_EXISTS}" == "1" ]]; then
        ok "User '${DB_USER}' exists."
        DB_PASS="$(ask_secret "Enter existing password for '${DB_USER}' (for DATABASE_URL)")"
    else
        DB_PASS="$(ask_secret "Password for '${DB_USER}' (empty = auto-generate)")"
        if [[ -z "${DB_PASS}" ]]; then
            DB_PASS="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 32)"
            info "Auto-generated password: ${DB_PASS}"
        fi
        sudo -u postgres psql -c "CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASS}';" >/dev/null
        ok "User '${DB_USER}' created."
    fi

    DB_EXISTS=$(sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" 2>/dev/null || true)
    if [[ "${DB_EXISTS}" == "1" ]]; then
        ok "Database '${DB_NAME}' exists."
    else
        sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" >/dev/null
        ok "Database '${DB_NAME}' created."
    fi

    SUMMARY_DATABASE_URL="postgres://${DB_USER}:${DB_PASS}@127.0.0.1:5432/${DB_NAME}"
fi

info "DATABASE_URL: ${SUMMARY_DATABASE_URL}"

# =============================================================================
# 6. Redis
# =============================================================================
header "Redis"

if dpkg -s redis-server &>/dev/null; then
    ok "Redis already installed."
else
    apt-get install -y -qq redis-server
    ok "Redis installed."
fi

if ! is_service_enabled redis-server; then systemctl enable redis-server; fi
if ! is_service_active redis-server; then
    systemctl start redis-server
    ok "Redis started."
else
    ok "Redis running."
fi

SUMMARY_REDIS_URL="redis://127.0.0.1:6379"

# =============================================================================
# 7. AWS CLI v2
# =============================================================================
header "AWS CLI v2"

if is_installed aws; then
    AWS_VERSION="$(aws --version 2>&1 | head -1)"
    if [[ "${AWS_VERSION}" == aws-cli/2.* ]]; then
        ok "AWS CLI v2 already installed."
    else
        warn "AWS CLI v1 detected. Upgrading to v2..."
        TMPDIR_AWS="$(mktemp -d)"
        curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "${TMPDIR_AWS}/awscliv2.zip"
        unzip -q "${TMPDIR_AWS}/awscliv2.zip" -d "${TMPDIR_AWS}"
        "${TMPDIR_AWS}/aws/install" --update
        rm -rf "${TMPDIR_AWS}"
        ok "AWS CLI v2 installed."
    fi
else
    info "Installing AWS CLI v2..."
    TMPDIR_AWS="$(mktemp -d)"
    curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "${TMPDIR_AWS}/awscliv2.zip"
    unzip -q "${TMPDIR_AWS}/awscliv2.zip" -d "${TMPDIR_AWS}"
    "${TMPDIR_AWS}/aws/install" --update
    rm -rf "${TMPDIR_AWS}"
    ok "AWS CLI v2 installed."
fi

if ask_yn "Configure AWS credentials now? (needed for R2/S3 deploy)" "n"; then
    aws configure
    ok "AWS credentials configured."
else
    warn "Skipped. Run 'aws configure' later before starting deploy-poll."
fi

# =============================================================================
# 8. Nginx
# =============================================================================
header "Nginx"

if dpkg -s nginx &>/dev/null; then
    ok "Nginx already installed."
else
    apt-get install -y -qq nginx
    ok "Nginx installed."
fi

if ! is_service_enabled nginx; then systemctl enable nginx; fi
if ! is_service_active nginx; then
    systemctl start nginx
    ok "Nginx started."
else
    ok "Nginx running."
fi

# Generate Nginx config for this app
if [[ -n "${DOMAIN}" ]]; then
    NGINX_CONF="/etc/nginx/sites-available/${APP_ID}"
    NGINX_ENABLED="/etc/nginx/sites-enabled/${APP_ID}"

    if [[ -f "${NGINX_CONF}" ]]; then
        ok "Nginx config already exists: ${NGINX_CONF}"
    else
        HTTP_PORT="$(ask "HTTP port for this app" "${EXISTING_SERVER_PORT:-3000}")"
        WS_PORT="$(ask "WebSocket port for this app" "${EXISTING_WS_PORT:-3010}")"
        SUMMARY_HTTP_PORT="${HTTP_PORT}"
        SUMMARY_WS_PORT="${WS_PORT}"

        cat > "${NGINX_CONF}" <<NGINX
server {
    listen 80;
    server_name ${DOMAIN};

    # Redirect to HTTPS after Certbot setup
    # (Certbot will modify this block automatically)

    location / {
        proxy_pass http://127.0.0.1:${HTTP_PORT};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # File uploads — adjust as needed
        client_max_body_size 50M;
    }

    location /ws {
        proxy_pass http://127.0.0.1:${WS_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
        ok "Nginx config written: ${NGINX_CONF}"

        # Enable site
        if [[ ! -L "${NGINX_ENABLED}" ]]; then
            ln -s "${NGINX_CONF}" "${NGINX_ENABLED}"
            ok "Site enabled: ${APP_ID}"
        fi

        # Remove default site if it exists
        if [[ -L "/etc/nginx/sites-enabled/default" ]]; then
            rm -f "/etc/nginx/sites-enabled/default"
            info "Removed default Nginx site."
        fi

        # Test and reload
        if nginx -t 2>/dev/null; then
            systemctl reload nginx
            ok "Nginx reloaded."
        else
            error "Nginx config test failed. Check: ${NGINX_CONF}"
        fi
    fi
else
    warn "No domain provided. Skipping Nginx site config."
    warn "You can set it up later by re-running setup or manually."
fi

# =============================================================================
# 9. Certbot (Let's Encrypt SSL)
# =============================================================================
header "SSL Certificate (Certbot)"

if is_installed certbot; then
    ok "Certbot already installed."
else
    apt-get install -y -qq certbot python3-certbot-nginx
    ok "Certbot installed."
fi

if [[ -n "${DOMAIN}" ]]; then
    # Check if cert already exists
    if certbot certificates 2>/dev/null | grep -q "${DOMAIN}"; then
        ok "SSL certificate for ${DOMAIN} already exists."
    else
        info "Domain: ${DOMAIN}"
        info "Make sure DNS is pointing to this server before proceeding."
        echo ""
        if ask_yn "Obtain SSL certificate for ${DOMAIN} now?" "y"; then
            CERT_EMAIL="$(ask "Email for Let's Encrypt notifications" "")"
            EMAIL_FLAG=""
            if [[ -n "${CERT_EMAIL}" ]]; then
                EMAIL_FLAG="--email ${CERT_EMAIL}"
            else
                EMAIL_FLAG="--register-unsafely-without-email"
            fi

            if certbot --nginx -d "${DOMAIN}" ${EMAIL_FLAG} --non-interactive --agree-tos; then
                ok "SSL certificate obtained and Nginx configured for HTTPS."
            else
                warn "Certbot failed. You can retry later: certbot --nginx -d ${DOMAIN}"
            fi
        else
            warn "Skipped SSL. Run later: certbot --nginx -d ${DOMAIN}"
        fi
    fi
else
    warn "No domain — skipping SSL setup."
fi

# =============================================================================
# 10. Application directory
# =============================================================================
header "Application Directory"

APP_SUBDIRS=(bin config public locales templates logs scripts)

if [[ -d "${APP_DIR}" ]]; then
    ok "${APP_DIR} exists."
else
    mkdir -p "${APP_DIR}"
    ok "Created ${APP_DIR}."
fi

for subdir in "${APP_SUBDIRS[@]}"; do
    mkdir -p "${APP_DIR}/${subdir}"
done
ok "Subdirectories ready."

chown -R "${SYS_USER}:${SYS_USER}" "${APP_DIR}"
ok "Ownership set to ${SYS_USER}:${SYS_USER}."

# Copy deploy-poll.sh
DEPLOY_POLL_SRC="${SCRIPT_DIR}/deploy-poll.sh"
if [[ -f "${DEPLOY_POLL_SRC}" ]]; then
    cp "${DEPLOY_POLL_SRC}" "${APP_DIR}/scripts/deploy-poll.sh"
    chmod +x "${APP_DIR}/scripts/deploy-poll.sh"
    ok "deploy-poll.sh copied."
fi

# Deploy polling bucket config. This is intentionally separate from app .env
# uploads: the bucket only stores artifact zips and VERSION, never secrets.
DEPLOY_CONF="${APP_DIR}/config/deploy.conf"
DEPLOY_BUCKET="$(ask "Deploy artifact bucket" "${EXISTING_DEPLOY_BUCKET}")"
DEPLOY_REGION="$(ask "Deploy artifact region (auto for R2)" "${EXISTING_DEPLOY_REGION:-auto}")"
DEPLOY_ENDPOINT="$(ask "Deploy artifact endpoint (blank for AWS S3)" "${EXISTING_DEPLOY_ENDPOINT}")"
DEPLOY_POLL_INTERVAL="$(ask "Poll interval in seconds" "${EXISTING_POLL_INTERVAL:-30}")"

if [[ -z "${DEPLOY_BUCKET}" ]]; then
    warn "Deploy artifact bucket is empty. Deploy polling will be disabled."
    SKIP_DEPLOY_POLL=true
fi

cat > "${DEPLOY_CONF}" <<CONF
# Deployment Configuration — ${APP_NAME} (${ENVIRONMENT})
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Bucket is for deployment artifacts only. Do not upload .env files.

APP_NAME="${APP_NAME}"
ENVIRONMENT="${ENVIRONMENT}"
APP_ID="${APP_ID}"
APP_DIR="${APP_DIR}"
BINARY_NAME="${BINARY_NAME}"
RUN_USER="${SYS_USER}"
POLL_INTERVAL="${DEPLOY_POLL_INTERVAL}"
DEPLOY_BUCKET="${DEPLOY_BUCKET}"
DEPLOY_REGION="${DEPLOY_REGION}"
DEPLOY_ENDPOINT="${DEPLOY_ENDPOINT}"
CONF
ok "deploy.conf written."

# =============================================================================
# 11. .env setup
# =============================================================================
header ".env Setup"

ENV_FILE="${APP_DIR}/.env"

if [[ -f "${ENV_FILE}" ]]; then
    info "Existing .env found — values will be used as defaults."
    info "Review and confirm each value below."
fi

# APP__SIGNING_KEY / CRYPT__KEY: preserve existing real keys, generate if placeholder or missing.
    if [[ -n "${EXISTING_APP_KEY}" && "${EXISTING_APP_KEY}" != "base64:change-me"* && "${EXISTING_APP_KEY}" != "base64:generate-me"* ]]; then
        SUMMARY_APP_KEY="${EXISTING_APP_KEY}"
        info "Preserving existing APP__SIGNING_KEY."
    else
        SUMMARY_APP_KEY="$(openssl rand -base64 32)"
        info "Generated new APP__SIGNING_KEY."
    fi
    if [[ -n "${EXISTING_CRYPT_KEY}" && "${EXISTING_CRYPT_KEY}" != "change-me"* ]]; then
        SUMMARY_CRYPT_KEY="${EXISTING_CRYPT_KEY}"
        info "Preserving existing CRYPT__KEY."
    else
        SUMMARY_CRYPT_KEY="$(openssl rand -base64 32)"
        info "Generated new CRYPT__KEY."
    fi

    # Use existing values as defaults (from .env on re-run, or from PG setup on first run)
    DEFAULT_DB_URL="${EXISTING_DATABASE_URL:-${SUMMARY_DATABASE_URL}}"
    DEFAULT_REDIS_URL="${EXISTING_REDIS_URL:-${SUMMARY_REDIS_URL}}"
    SUMMARY_HTTP_PORT="${EXISTING_SERVER_PORT:-${SUMMARY_HTTP_PORT}}"
    SUMMARY_WS_PORT="${EXISTING_WS_PORT:-${SUMMARY_WS_PORT}}"

FINAL_DATABASE_URL="$(ask "DATABASE_URL" "${DEFAULT_DB_URL}")"
FINAL_REDIS_URL="$(ask "REDIS_URL" "${DEFAULT_REDIS_URL}")"

SUMMARY_DATABASE_URL="${FINAL_DATABASE_URL}"
SUMMARY_REDIS_URL="${FINAL_REDIS_URL}"

cat > "${ENV_FILE}" <<ENV
APP__NAME=${APP_NAME}
APP__ENVIRONMENT=${ENVIRONMENT}
APP__SIGNING_KEY=${SUMMARY_APP_KEY}
CRYPT__KEY=${SUMMARY_CRYPT_KEY}

SERVER__HOST=127.0.0.1
SERVER__PORT=${SUMMARY_HTTP_PORT}
WEBSOCKET__HOST=127.0.0.1
WEBSOCKET__PORT=${SUMMARY_WS_PORT}

DATABASE__URL=${SUMMARY_DATABASE_URL}
REDIS__URL=${SUMMARY_REDIS_URL}
REDIS__NAMESPACE=${REDIS_NAMESPACE}
ENV

chmod 600 "${ENV_FILE}"
chown "${SYS_USER}:${SYS_USER}" "${ENV_FILE}"
ok ".env written (permissions: 600)."

# =============================================================================
# 12. Systemd services
# =============================================================================
header "Systemd Services"

generate_service_unit() {
    local service_name="$1"
    local process_type="$2"
    local description="$3"

    cat > "${SYSTEMD_DEST}/${service_name}.service" <<EOF
[Unit]
Description=${APP_NAME} (${ENVIRONMENT}) — ${description}
After=network.target postgresql.service redis.service
Wants=postgresql.service redis.service

[Service]
Type=simple
User=${SYS_USER}
Group=${SYS_USER}
WorkingDirectory=${APP_DIR}
Environment=PROCESS=${process_type}
EnvironmentFile=${APP_DIR}/.env
ExecStart=${APP_DIR}/bin/${BINARY_NAME}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${service_name}

[Install]
WantedBy=multi-user.target
EOF
}

generate_deploy_poll_unit() {
    local service_name="$1"

    cat > "${SYSTEMD_DEST}/${service_name}.service" <<EOF
[Unit]
Description=${APP_NAME} (${ENVIRONMENT}) — Deploy Poller
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${APP_DIR}
ExecStart=${APP_DIR}/scripts/deploy-poll.sh
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${service_name}

[Install]
WantedBy=multi-user.target
EOF
}

declare -A SERVICE_MAP=(
    ["${APP_ID}-http"]="http:HTTP Server"
    ["${APP_ID}-worker"]="worker:Background Worker"
    ["${APP_ID}-scheduler"]="scheduler:Task Scheduler"
    ["${APP_ID}-websocket"]="websocket:WebSocket Server"
)

SERVICES=()

for service_name in "${!SERVICE_MAP[@]}"; do
    IFS=':' read -r process_type description <<< "${SERVICE_MAP[${service_name}]}"
    generate_service_unit "${service_name}" "${process_type}" "${description}"
    ok "Generated ${service_name}.service"
    SERVICES+=("${service_name}")
done

# Deploy-poll — only if deploy bucket is configured
DEPLOY_POLL_SVC="${APP_ID}-deploy-poll"
if [[ "${SKIP_DEPLOY_POLL}" == false ]]; then
    generate_deploy_poll_unit "${DEPLOY_POLL_SVC}"
    ok "Generated ${DEPLOY_POLL_SVC}.service"
    SERVICES+=("${DEPLOY_POLL_SVC}")
else
    warn "Skipping deploy-poll service (deploy bucket not configured)."
    warn "Set DEPLOY_BUCKET in deploy.conf or .env, then re-run setup to enable."
fi

systemctl daemon-reload
ok "systemd daemon reloaded."

for svc in "${SERVICES[@]}"; do
    if ! is_service_enabled "${svc}"; then
        systemctl enable "${svc}"
        ok "Enabled ${svc}."
    else
        ok "${svc} already enabled."
    fi
done

info "Services installed but not started (waiting for first deployment)."

# =============================================================================
# Summary
# =============================================================================
header "Setup Complete"

echo -e "${GREEN}┌──────────────────────────────────────────────────────────────┐${NC}"
echo -e "${GREEN}│              Provisioning Summary                            │${NC}"
echo -e "${GREEN}├──────────────────────────────────────────────────────────────┤${NC}"
echo -e "${GREEN}│${NC} APP_ID:         ${APP_ID}"
echo -e "${GREEN}│${NC} APP_DIR:        ${APP_DIR}"
echo -e "${GREEN}│${NC} DOMAIN:         ${SUMMARY_DOMAIN:-<none>}"
echo -e "${GREEN}│${NC}"
echo -e "${GREEN}│${NC} DATABASE_URL:   ${SUMMARY_DATABASE_URL}"
echo -e "${GREEN}│${NC} REDIS_URL:      ${SUMMARY_REDIS_URL}"
echo -e "${GREEN}│${NC}"
echo -e "${GREEN}│${NC} Services:"
for svc in "${SERVICES[@]}"; do
    echo -e "${GREEN}│${NC}   ${svc}.service"
done
if [[ "${SKIP_DEPLOY_POLL}" == true ]]; then
    echo -e "${GREEN}│${NC}"
    echo -e "${YELLOW}│  WARNING: deploy-poll disabled — configure deploy bucket${NC}"
fi
if [[ -n "${SUMMARY_DOMAIN}" ]]; then
    echo -e "${GREEN}│${NC}"
    echo -e "${GREEN}│${NC} Nginx:          /etc/nginx/sites-available/${APP_ID}"
fi
echo -e "${GREEN}├──────────────────────────────────────────────────────────────┤${NC}"
echo -e "${GREEN}│${NC} Commands:"
echo -e "${GREEN}│${NC}   systemctl status ${APP_ID}-http"
echo -e "${GREEN}│${NC}   journalctl -u ${APP_ID}-http -f"
echo -e "${GREEN}│${NC}   systemctl list-units '${APP_ID}-*'"
echo -e "${GREEN}└──────────────────────────────────────────────────────────────┘${NC}"
