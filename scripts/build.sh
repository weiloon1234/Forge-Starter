#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Forge — Local Build & Deploy to S3/R2
# Builds inside Docker, uploads artifact zip + VERSION file.
#
# Sensitive .env files are never uploaded. The selected .env.{environment} file
# is read locally only for deploy upload settings and public VITE_* frontend values.
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

configure_upload_credentials() {
    local env_file="$1"
    local access_key secret_key session_token profile

    access_key="$(first_config_value "$env_file" DEPLOY_ACCESS_KEY_ID AWS_ACCESS_KEY_ID STORAGE__DISKS__R2__KEY STORAGE__DISKS__S3__KEY || true)"
    secret_key="$(first_config_value "$env_file" DEPLOY_SECRET_ACCESS_KEY AWS_SECRET_ACCESS_KEY STORAGE__DISKS__R2__SECRET STORAGE__DISKS__S3__SECRET || true)"
    session_token="$(first_config_value "$env_file" DEPLOY_SESSION_TOKEN AWS_SESSION_TOKEN || true)"
    profile="$(first_config_value "$env_file" DEPLOY_PROFILE AWS_PROFILE || true)"

    if [[ -n "$access_key" || -n "$secret_key" ]]; then
        if [[ -z "$access_key" || -z "$secret_key" ]]; then
            error "Deploy upload credentials are incomplete."
            error "Set both DEPLOY_ACCESS_KEY_ID and DEPLOY_SECRET_ACCESS_KEY in $env_file, or configure your local AWS CLI profile."
            exit 1
        fi

        if [[ "$access_key" == "$secret_key" ]]; then
            warn "DEPLOY_ACCESS_KEY_ID and DEPLOY_SECRET_ACCESS_KEY are identical. For R2/S3 this is usually a copy-paste mistake."
        fi

        export AWS_ACCESS_KEY_ID="$access_key"
        export AWS_SECRET_ACCESS_KEY="$secret_key"
        if [[ -n "$session_token" ]]; then
            export AWS_SESSION_TOKEN="$session_token"
        fi
        ok "Deploy upload credentials loaded from $env_file"
        return 0
    fi

    if [[ -n "$profile" ]]; then
        export AWS_PROFILE="$profile"
        ok "Deploy upload will use AWS profile: $profile"
        return 0
    fi

    warn "No deploy upload credentials found in $env_file."
    warn "AWS CLI will use your local AWS config, if available."
}

validate_deploy_options() {
    if ! [[ "$DEPLOY_RETAIN_RELEASES" =~ ^[0-9]+$ ]] || (( DEPLOY_RETAIN_RELEASES < 1 )); then
        warn "Invalid DEPLOY_RETAIN_RELEASES='$DEPLOY_RETAIN_RELEASES'. Using 5."
        DEPLOY_RETAIN_RELEASES=5
    fi

    case "$DEPLOY_DOCKER_CLEANUP" in
        aggressive|balanced|conservative|off) ;;
        *)
            warn "Invalid DEPLOY_DOCKER_CLEANUP='$DEPLOY_DOCKER_CLEANUP'. Using aggressive."
            DEPLOY_DOCKER_CLEANUP="aggressive"
            ;;
    esac
}

artifact_entry_allowed() {
    local entry="$1"

    if [[ "$entry" == config/*.toml && "${entry#config/}" != */* ]]; then
        return 0
    fi

    case "$entry" in
        "$BINARY_NAME"|public/|public/*|config/|locales/|locales/*|templates/|templates/*|docs/|docs/*)
            return 0
            ;;
    esac

    return 1
}

artifact_entry_forbidden() {
    local entry="$1"

    case "$entry" in
        .DS_Store|*/.DS_Store)
            return 0
            ;;
        .env|.env.*|*/.env|*/.env.*|Cargo.toml|Cargo.lock|*/Cargo.toml|*/Cargo.lock)
            return 0
            ;;
        .git|.git/*|*/.git|*/.git/*|node_modules|node_modules/*|*/node_modules|*/node_modules/*)
            return 0
            ;;
        target|target/*|*/target|*/target/*|scripts|scripts/*|*/scripts|*/scripts/*)
            return 0
            ;;
        database|database/*|*/database|*/database/*|tests|tests/*|*/tests|*/tests/*)
            return 0
            ;;
        src|src/*|*/src|*/src/*|frontend|frontend/*|*/frontend|*/frontend/*)
            return 0
            ;;
    esac

    return 1
}

verify_artifact_zip() {
    local zip_path="$1"
    local entry
    local has_binary=false
    local unsafe_entries=()

    info "Verifying artifact contents..."

    while IFS= read -r entry; do
        [[ -z "$entry" ]] && continue
        if [[ "$entry" == "$BINARY_NAME" ]]; then
            has_binary=true
        fi
        if ! artifact_entry_allowed "$entry" || artifact_entry_forbidden "$entry"; then
            unsafe_entries+=("$entry")
        fi
    done < <(unzip -Z -1 "$zip_path")

    if [[ "$has_binary" != true ]]; then
        error "Artifact is missing the compiled binary: $BINARY_NAME"
        exit 1
    fi

    if [[ ${#unsafe_entries[@]} -gt 0 ]]; then
        error "Artifact contains forbidden or non-runtime paths:"
        printf '  %s\n' "${unsafe_entries[@]:0:25}"
        if [[ ${#unsafe_entries[@]} -gt 25 ]]; then
            error "...and $(( ${#unsafe_entries[@]} - 25 )) more."
        fi
        error "Deploy aborted before upload."
        exit 1
    fi

    ok "Artifact contains runtime files only."
}

prune_artifact_config() {
    if [[ -d "$TEMP_DIR/config" ]]; then
        find "$TEMP_DIR/config" -mindepth 1 -maxdepth 1 ! -name '*.toml' -exec rm -rf {} +
    fi
}

prune_artifact_junk() {
    find "$TEMP_DIR" -name '.DS_Store' -delete
}

aws_s3() {
    local args=("s3")

    if [[ -n "$S3_REGION" ]]; then
        args+=(--region "$S3_REGION")
    fi
    if [[ -n "$S3_ENDPOINT" ]]; then
        args+=(--endpoint-url "$S3_ENDPOINT")
    fi

    aws "${args[@]}" "$@"
}

prune_bucket_releases() {
    local retain="$1"
    local listing
    local old_files=()
    local file

    info "Applying bucket retention: keeping newest ${retain} artifact zip(s)."
    if ! listing="$(aws_s3 ls "${S3_BASE}/" 2>/dev/null)"; then
        warn "Could not list bucket artifacts for retention cleanup."
        return 0
    fi

    while IFS= read -r file; do
        [[ -n "$file" ]] && old_files+=("$file")
    done < <(
        printf '%s\n' "$listing" \
            | awk -v binary="$BINARY_NAME" '$4 ~ "^" binary "-.*\\.zip$" { print $1 "T" $2 " " $4 }' \
            | sort -r \
            | tail -n +"$(( retain + 1 ))" \
            | awk '{ print $2 }'
    )

    if [[ ${#old_files[@]} -eq 0 ]]; then
        ok "No old bucket artifacts to remove."
        return 0
    fi

    for file in "${old_files[@]}"; do
        info "Removing old bucket artifact: $file"
        if ! aws_s3 rm "${S3_BASE}/${file}"; then
            warn "Failed to remove old bucket artifact: $file"
        fi
    done
}

cleanup_docker_after_success() {
    local mode="$1"

    if [[ "$mode" == "off" ]]; then
        ok "Docker cleanup skipped."
        return 0
    fi

    info "Cleaning local Docker deploy artifacts (${mode})."

    if [[ -n "$TEMP_CONTAINER" ]]; then
        docker rm "$TEMP_CONTAINER" &>/dev/null || true
        TEMP_CONTAINER=""
    fi

    if [[ "$mode" == "aggressive" || "$mode" == "balanced" || "$mode" == "conservative" ]]; then
        docker image rm "${BINARY_NAME}-build" &>/dev/null || true
    fi

    if [[ "$mode" == "aggressive" ]]; then
        if docker builder prune --all --force; then
            ok "Docker build cache pruned."
        else
            warn "Docker build cache prune failed."
        fi
    elif [[ "$mode" == "balanced" ]]; then
        if docker builder prune --force --filter until=168h; then
            ok "Docker build cache older than 7 days pruned."
        else
            warn "Docker build cache prune failed."
        fi
    fi
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

if ! command -v zip &>/dev/null || ! command -v unzip &>/dev/null; then
    error "'zip' and 'unzip' are required to create and verify deploy artifacts."
    exit 1
fi
ok "zip/unzip found"

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
DEPLOY_RETAIN_RELEASES="$(first_config_value "$ENV_FILE" DEPLOY_RETAIN_RELEASES || true)"
DEPLOY_DOCKER_CLEANUP="$(first_config_value "$ENV_FILE" DEPLOY_DOCKER_CLEANUP || true)"
DEPLOY_DOCKER_PLATFORM="$(first_config_value "$ENV_FILE" DEPLOY_DOCKER_PLATFORM || true)"
: "${S3_REGION:=auto}"
: "${S3_ENDPOINT:=}"
: "${DEPLOY_RETAIN_RELEASES:=5}"
: "${DEPLOY_DOCKER_CLEANUP:=aggressive}"
: "${DEPLOY_DOCKER_PLATFORM:=linux/amd64}"
export AWS_DEFAULT_REGION="${AWS_DEFAULT_REGION:-$S3_REGION}"
configure_upload_credentials "$ENV_FILE"
validate_deploy_options

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
ok "Retention:    keep newest ${DEPLOY_RETAIN_RELEASES} zip(s)"
ok "Docker clean: $DEPLOY_DOCKER_CLEANUP"
ok "Platform:     $DEPLOY_DOCKER_PLATFORM"
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
    --platform "$DEPLOY_DOCKER_PLATFORM" \
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
prune_artifact_config
prune_artifact_junk

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
verify_artifact_zip "$ZIP_PATH"

# ---------------------------------------------------------------------------
# S3/R2 upload helper
# ---------------------------------------------------------------------------
s3_cp() {
    local src="$1"
    local dest="$2"

    aws_s3 cp "$src" "$dest"
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

prune_bucket_releases "$DEPLOY_RETAIN_RELEASES"
cleanup_docker_after_success "$DEPLOY_DOCKER_CLEANUP"

TOTAL_END=$(date +%s)
TOTAL_DURATION=$(( TOTAL_END - BUILD_START ))

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
