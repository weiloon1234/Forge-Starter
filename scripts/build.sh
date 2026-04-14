#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Forge — Local Build & Deploy to S3/R2
# Builds inside Docker, uploads artifact zip + VERSION file.
# S3 config read from config/storage.toml (same bucket the app uses).
# Deployment artifacts stored under _deployments/{app_name}/{environment}/.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PARENT_DIR="$(cd "$PROJECT_DIR/.." && pwd)"
BUILD_CONF="$SCRIPT_DIR/.build.conf"
STORAGE_TOML="$PROJECT_DIR/config/storage.toml"

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

cleanup() {
    if [[ -n "$TEMP_CONTAINER" ]]; then
        docker rm "$TEMP_CONTAINER" &>/dev/null || true
    fi
    if [[ -n "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Fixed binary name — never changes, identity comes from APP_NAME config
# ---------------------------------------------------------------------------
BINARY_NAME="app"

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
# Parse S3 config from storage.toml
# ---------------------------------------------------------------------------

parse_storage_config() {
    if [[ ! -f "$STORAGE_TOML" ]]; then
        error "config/storage.toml not found"
        exit 1
    fi

    # Read default disk name from [storage] default = "..."
    local default_disk
    default_disk="$(grep -oP '^\s*default\s*=\s*"\K[^"]+' "$STORAGE_TOML" | head -1)"
    if [[ -z "$default_disk" ]]; then
        error "No default disk set in config/storage.toml"
        exit 1
    fi

    # Read config from [storage.disks.{default}]
    local section="storage\\.disks\\.${default_disk}"
    S3_BUCKET="$(grep -A20 "^\[${section}\]" "$STORAGE_TOML" | grep '^\s*bucket' | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')"
    S3_REGION="$(grep -A20 "^\[${section}\]" "$STORAGE_TOML" | grep '^\s*region' | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')"
    S3_ENDPOINT="$(grep -A20 "^\[${section}\]" "$STORAGE_TOML" | grep '^\s*endpoint' | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')"

    : "${S3_REGION:=auto}"
    : "${S3_ENDPOINT:=}"

    if [[ -z "$S3_BUCKET" ]]; then
        error "Bucket not configured in config/storage.toml [storage.disks.${default_disk}]"
        error "Fill in the bucket field before building."
        exit 1
    fi

    ok "Disk:         ${default_disk} (from config/storage.toml)"
    ok "Bucket:       $S3_BUCKET"
    ok "Region:       ${S3_REGION}"
    ok "Endpoint:     ${S3_ENDPOINT:-<none>}"
}

parse_storage_config

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

# Try to read default app name from config/app.toml
DEFAULT_APP_FROM_TOML=""
APP_TOML="$PROJECT_DIR/config/app.toml"
if [[ -f "$APP_TOML" ]]; then
    DEFAULT_APP_FROM_TOML="$(grep '^\s*name' "$APP_TOML" | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')"
fi

# ---------------------------------------------------------------------------
# Interactive prompts (app name + environment only)
# ---------------------------------------------------------------------------
echo ""
info "Build configuration"
echo "-------------------------------------------"

# App name
DEFAULT_APP_NAME="${PREV_APP_NAME:-${DEFAULT_APP_FROM_TOML:-$BINARY_NAME}}"
read -rp "App name [$DEFAULT_APP_NAME]: " INPUT_APP_NAME
APP_NAME="${INPUT_APP_NAME:-$DEFAULT_APP_NAME}"

# Environment
DEFAULT_ENV="${PREV_ENV:-staging}"
read -rp "Environment (staging/production) [$DEFAULT_ENV]: " INPUT_ENV
DEPLOY_ENV="${INPUT_ENV:-$DEFAULT_ENV}"
if [[ "$DEPLOY_ENV" != "staging" && "$DEPLOY_ENV" != "production" ]]; then
    error "Environment must be 'staging' or 'production'"
    exit 1
fi

echo "-------------------------------------------"
ok "App name:     $APP_NAME"
ok "Binary:       $BINARY_NAME"
ok "Environment:  $DEPLOY_ENV"
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
# Read VITE_* from .env.{environment}
# ---------------------------------------------------------------------------
ENV_FILE="$PROJECT_DIR/.env.$DEPLOY_ENV"
VITE_BUILD_ARGS=()

if [[ -f "$ENV_FILE" ]]; then
    info "Reading VITE_* vars from $ENV_FILE"
    while IFS= read -r line; do
        [[ -z "$line" || "$line" =~ ^# ]] && continue
        if [[ "$line" =~ ^VITE_ ]]; then
            VITE_BUILD_ARGS+=("--build-arg" "$line")
            ok "  $line"
        fi
    done < "$ENV_FILE"
    if [[ ${#VITE_BUILD_ARGS[@]} -eq 0 ]]; then
        warn "No VITE_* variables found in $ENV_FILE"
    fi
else
    warn "Env file not found: $ENV_FILE"
    read -rp "Continue without frontend env vars? (y/N): " CONTINUE
    if [[ "${CONTINUE,,}" != "y" ]]; then
        info "Aborted."
        exit 0
    fi
fi

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

# Build from parent directory (context includes both Forge/ and Forge-Starter/)
docker build \
    -f Forge-Starter/Dockerfile \
    --build-arg "BINARY_NAME=${BINARY_NAME}" \
    "${VITE_BUILD_ARGS[@]}" \
    -t "${BINARY_NAME}-build" \
    "$PARENT_DIR"

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

# ---------------------------------------------------------------------------
# Optionally upload .env
# ---------------------------------------------------------------------------
if [[ -f "$ENV_FILE" ]]; then
    echo ""
    read -rp "Upload .env.$DEPLOY_ENV to bucket? (for server to pull) (y/N): " UPLOAD_ENV
    if [[ "${UPLOAD_ENV,,}" == "y" ]]; then
        S3_ENV_PATH="${S3_BASE}/.env"
        info "Uploading .env.$DEPLOY_ENV to $S3_ENV_PATH"
        s3_cp "$ENV_FILE" "$S3_ENV_PATH"
        ok ".env uploaded"
    fi
fi

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
