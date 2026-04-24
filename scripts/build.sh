#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Forge — Local Build & Deploy to S3/R2
# Builds inside Docker, uploads artifact zip + VERSION file.
#
# Sensitive .env files are never uploaded. The selected .env.{environment} file
# is read locally only for DEPLOY_* settings and public VITE_* frontend values.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_CONF="$SCRIPT_DIR/.build.conf"

# ---------------------------------------------------------------------------
# Colors
# ---------------------------------------------------------------------------
INFO='\033[0;34m'
OK='\033[0;32m'
WARN='\033[0;33m'
ERR='\033[0;31m'
NC='\033[0m'

info()  { echo -e "${INFO}[INFO]${NC}  $*"; }
ok()    { echo -e "${OK}[OK]${NC}    $*"; }
warn()  { echo -e "${WARN}[WARN]${NC}  $*"; }
error() { echo -e "${ERR}[ERROR]${NC} $*"; }

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
TEMP_CONTAINER=""
TEMP_DIR=""
VITE_ENV_CREATED=()
VITE_ENV_BACKUPS=()

cleanup() {
    if [[ -n "$TEMP_CONTAINER" ]]; then
        docker rm "$TEMP_CONTAINER" &>/dev/null || true
    fi
    if [[ -n "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
    for pair in "${VITE_ENV_BACKUPS[@]}"; do
        local file="${pair%%::*}"
        local backup="${pair#*::}"
        if [[ -f "$backup" ]]; then
            mv "$backup" "$file"
        fi
    done
    for file in "${VITE_ENV_CREATED[@]}"; do
        rm -f "$file"
    done
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Fixed binary name — never changes, identity comes from APP_NAME config
# ---------------------------------------------------------------------------
BINARY_NAME="app"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
trim() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
}

strip_quotes() {
    local value
    value="$(trim "$1")"
    if [[ "$value" == \"*\" && "$value" == *\" && ${#value} -ge 2 ]]; then
        value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' && ${#value} -ge 2 ]]; then
        value="${value:1:${#value}-2}"
    fi
    printf '%s' "$value"
}

env_file_value() {
    local wanted="$1"
    local file="$2"
    local line key value

    [[ -f "$file" ]] || return 1

    while IFS= read -r line || [[ -n "$line" ]]; do
        line="$(trim "$line")"
        [[ -z "$line" || "$line" == \#* ]] && continue
        if [[ "$line" == export\ * ]]; then
            line="$(trim "${line#export }")"
        fi
        [[ "$line" == *=* ]] || continue
        key="$(trim "${line%%=*}")"
        if [[ "$key" == "$wanted" ]]; then
            value="${line#*=}"
            strip_quotes "$value"
            return 0
        fi
    done < "$file"

    return 1
}

first_config_value() {
    local file="$1"
    shift

    local key value
    for key in "$@"; do
        value="$(printenv "$key" 2>/dev/null || true)"
        if [[ -z "$value" && -f "$file" ]]; then
            value="$(env_file_value "$key" "$file" || true)"
        fi
        if [[ -n "$value" ]]; then
            printf '%s' "$value"
            return 0
        fi
    done

    return 1
}

frontend_portals() {
    local portal
    for portal in website admin user team; do
        if [[ -d "$PROJECT_DIR/frontend/$portal" ]]; then
            printf '%s\n' "$portal"
        fi
    done
}

read_app_name_from_config() {
    local config="$PROJECT_DIR/config/forge.toml"
    [[ -f "$config" ]] || return 0

    awk '
        /^\[app\]/ { in_app = 1; next }
        /^\[/ { in_app = 0 }
        in_app && /^[[:space:]]*name[[:space:]]*=/ {
            sub(/^[^=]*=[[:space:]]*"/, "")
            sub(/".*$/, "")
            print
            exit
        }
    ' "$config"
}

prepare_vite_env_files() {
    local env_file="$1"
    local vite_lines=()
    local line normalized portal target backup

    if [[ -f "$env_file" ]]; then
        info "Reading public VITE_* vars from $env_file"
        while IFS= read -r line || [[ -n "$line" ]]; do
            normalized="$(trim "$line")"
            [[ -z "$normalized" || "$normalized" == \#* ]] && continue
            if [[ "$normalized" == export\ * ]]; then
                normalized="$(trim "${normalized#export }")"
            fi
            if [[ "$normalized" == VITE_* ]]; then
                vite_lines+=("$normalized")
                ok "  $normalized"
            fi
        done < "$env_file"
    else
        warn "Env file not found: $env_file"
    fi

    while IFS= read -r line; do
        [[ "$line" == VITE_* ]] || continue
        vite_lines+=("$line")
    done < <(env)

    if [[ ${#vite_lines[@]} -eq 0 ]]; then
        warn "No VITE_* variables found. Frontends will use code defaults."
        return 0
    fi

    while IFS= read -r portal; do
        target="$PROJECT_DIR/frontend/$portal/.env.production.local"
        if [[ -f "$target" ]]; then
            backup="${target}.deploy-backup"
            cp "$target" "$backup"
            VITE_ENV_BACKUPS+=("$target::$backup")
        else
            VITE_ENV_CREATED+=("$target")
        fi

        {
            echo "# Generated temporarily by scripts/build.sh. Safe public VITE_* values only."
            printf '%s\n' "${vite_lines[@]}"
        } > "$target"
    done < <(frontend_portals)
}

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

if ! command -v aws &>/dev/null; then
    error "'aws' CLI is not installed. Install it first: https://aws.amazon.com/cli/"
    exit 1
fi
ok "aws CLI found"

if ! docker info &>/dev/null 2>&1; then
    error "Docker is not running. Start Docker Desktop and try again."
    exit 1
fi
ok "Docker is running"

# ---------------------------------------------------------------------------
# Load previous config (app name + environment only)
# ---------------------------------------------------------------------------
PREV_APP_NAME=""
PREV_ENV=""

if [[ -f "$BUILD_CONF" ]]; then
    # shellcheck source=/dev/null
    source "$BUILD_CONF"
    PREV_APP_NAME="${APP_NAME:-}"
    PREV_ENV="${DEPLOY_ENV:-}"
fi

# Env vars take precedence over saved config
PREV_APP_NAME="${APP_NAME:-$PREV_APP_NAME}"
PREV_ENV="${DEPLOY_ENV:-$PREV_ENV}"

# ---------------------------------------------------------------------------
# Interactive prompts (app name + environment only)
# ---------------------------------------------------------------------------
echo ""
info "Build configuration"
echo "-------------------------------------------"

DEFAULT_APP_FROM_TOML="$(read_app_name_from_config)"
DEFAULT_APP_NAME="${PREV_APP_NAME:-${DEFAULT_APP_FROM_TOML:-$BINARY_NAME}}"
read -rp "App name [$DEFAULT_APP_NAME]: " INPUT_APP_NAME
APP_NAME="${INPUT_APP_NAME:-$DEFAULT_APP_NAME}"

DEFAULT_ENV="${PREV_ENV:-staging}"
read -rp "Environment (staging/production) [$DEFAULT_ENV]: " INPUT_ENV
DEPLOY_ENV="${INPUT_ENV:-$DEFAULT_ENV}"
if [[ "$DEPLOY_ENV" != "staging" && "$DEPLOY_ENV" != "production" ]]; then
    error "Environment must be 'staging' or 'production'"
    exit 1
fi

ENV_FILE="$PROJECT_DIR/.env.$DEPLOY_ENV"
S3_BUCKET="$(first_config_value "$ENV_FILE" DEPLOY_BUCKET STORAGE__DISKS__R2__BUCKET STORAGE__DISKS__S3__BUCKET || true)"
S3_REGION="$(first_config_value "$ENV_FILE" DEPLOY_REGION STORAGE__DISKS__R2__REGION STORAGE__DISKS__S3__REGION || true)"
S3_ENDPOINT="$(first_config_value "$ENV_FILE" DEPLOY_ENDPOINT STORAGE__DISKS__R2__ENDPOINT STORAGE__DISKS__S3__ENDPOINT || true)"
: "${S3_REGION:=auto}"
: "${S3_ENDPOINT:=}"

if [[ -z "$S3_BUCKET" ]]; then
    error "Deploy bucket is not configured."
    error "Set DEPLOY_BUCKET in $ENV_FILE or export DEPLOY_BUCKET before running make deploy."
    exit 1
fi

echo "-------------------------------------------"
ok "App name:     $APP_NAME"
ok "Binary:       $BINARY_NAME"
ok "Environment:  $DEPLOY_ENV"
ok "Bucket:       $S3_BUCKET"
ok "Region:       $S3_REGION"
ok "Endpoint:     ${S3_ENDPOINT:-<none>}"
echo ""

# ---------------------------------------------------------------------------
# Save config for next run (app name + environment only)
# ---------------------------------------------------------------------------
cat > "$BUILD_CONF" <<EOF
APP_NAME=$APP_NAME
DEPLOY_ENV=$DEPLOY_ENV
EOF
ok "Config saved to $BUILD_CONF"

# ---------------------------------------------------------------------------
# Prepare public frontend env
# ---------------------------------------------------------------------------
prepare_vite_env_files "$ENV_FILE"

# ---------------------------------------------------------------------------
# Generate version
# ---------------------------------------------------------------------------
cd "$PROJECT_DIR"
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "nohash")
TIMESTAMP=$(date +%Y%m%d%H%M%S)
VERSION="${GIT_HASH}-${TIMESTAMP}"
info "Version: $VERSION"

# ---------------------------------------------------------------------------
# Docker build
# ---------------------------------------------------------------------------
echo ""
info "Starting Docker build..."
BUILD_START=$(date +%s)

docker build \
    -f "$PROJECT_DIR/Dockerfile" \
    --build-arg "BINARY_NAME=${BINARY_NAME}" \
    -t "${BINARY_NAME}-build" \
    "$PROJECT_DIR"

BUILD_END=$(date +%s)
BUILD_DURATION=$(( BUILD_END - BUILD_START ))
ok "Docker build completed in ${BUILD_DURATION}s"

# ---------------------------------------------------------------------------
# Extract artifacts from Docker
# ---------------------------------------------------------------------------
info "Extracting artifacts..."
TEMP_DIR=$(mktemp -d)
TEMP_CONTAINER=$(docker create "${BINARY_NAME}-build")

docker cp "$TEMP_CONTAINER:/artifact/$BINARY_NAME"   "$TEMP_DIR/$BINARY_NAME"
docker cp "$TEMP_CONTAINER:/artifact/public"          "$TEMP_DIR/public"
docker cp "$TEMP_CONTAINER:/artifact/config"          "$TEMP_DIR/config"
docker cp "$TEMP_CONTAINER:/artifact/locales"         "$TEMP_DIR/locales"
docker cp "$TEMP_CONTAINER:/artifact/templates"       "$TEMP_DIR/templates"
docker cp "$TEMP_CONTAINER:/artifact/docs"            "$TEMP_DIR/docs"

ok "Artifacts extracted"

# ---------------------------------------------------------------------------
# Create zip
# ---------------------------------------------------------------------------
ZIP_NAME="${BINARY_NAME}-${VERSION}.zip"
ZIP_PATH="$TEMP_DIR/$ZIP_NAME"

info "Creating archive: $ZIP_NAME"
(cd "$TEMP_DIR" && zip -r "$ZIP_NAME" "$BINARY_NAME" public/ config/ locales/ templates/ docs/)

ZIP_SIZE=$(du -h "$ZIP_PATH" | cut -f1)
ok "Archive created: $ZIP_SIZE"

# ---------------------------------------------------------------------------
# S3/R2 upload helper
# ---------------------------------------------------------------------------
s3_cp() {
    local src="$1"
    local dest="$2"
    local extra_args=()

    if [[ "$S3_REGION" != "auto" ]]; then
        extra_args+=(--region "$S3_REGION")
    fi
    if [[ -n "$S3_ENDPOINT" ]]; then
        extra_args+=(--endpoint-url "$S3_ENDPOINT")
    fi

    aws s3 cp "$src" "$dest" "${extra_args[@]}"
}

# S3 path: s3://{bucket}/_deployments/{app_name}/{environment}/
S3_BASE="s3://${S3_BUCKET}/_deployments/${APP_NAME}/${DEPLOY_ENV}"

# ---------------------------------------------------------------------------
# Upload artifact zip
# ---------------------------------------------------------------------------
UPLOAD_START=$(date +%s)
S3_ZIP_PATH="${S3_BASE}/${ZIP_NAME}"
info "Uploading $ZIP_NAME to $S3_ZIP_PATH"
s3_cp "$ZIP_PATH" "$S3_ZIP_PATH"
ok "Artifact uploaded"

# ---------------------------------------------------------------------------
# Upload VERSION file
# ---------------------------------------------------------------------------
VERSION_FILE="$TEMP_DIR/VERSION"
echo "$VERSION" > "$VERSION_FILE"
S3_VERSION_PATH="${S3_BASE}/VERSION"
info "Uploading VERSION to $S3_VERSION_PATH"
s3_cp "$VERSION_FILE" "$S3_VERSION_PATH"
ok "VERSION uploaded"

UPLOAD_END=$(date +%s)
UPLOAD_DURATION=$(( UPLOAD_END - UPLOAD_START ))
TOTAL_DURATION=$(( UPLOAD_END - BUILD_START ))

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "==========================================="
echo -e "${OK}BUILD COMPLETE${NC}"
echo "==========================================="
echo "  App:           $APP_NAME"
echo "  Binary:        $BINARY_NAME"
echo "  Version:       $VERSION"
echo "  Environment:   $DEPLOY_ENV"
echo "  Artifact:      $S3_ZIP_PATH"
echo "  Artifact size: $ZIP_SIZE"
echo "  VERSION file:  $S3_VERSION_PATH"
echo "  Build time:    ${BUILD_DURATION}s"
echo "  Upload time:   ${UPLOAD_DURATION}s"
echo "  Total time:    ${TOTAL_DURATION}s"
echo "==========================================="
