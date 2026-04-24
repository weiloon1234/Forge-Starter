#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Forge — Deployment Poller
# Long-running daemon that polls S3/R2 for new versions and deploys them.
# Reads identity and deploy bucket from deploy.conf or the server .env.
# Never downloads or replaces the server .env from the bucket.
# Designed to run as a systemd service.
# =============================================================================

# -----------------------------------------------------------------------------
# Configuration — loaded from deploy.conf + optional server .env fallback
# -----------------------------------------------------------------------------

# Config path; overridable via DEPLOY_CONF env var.
# Installed setup copies this script to $APP_DIR/scripts and deploy.conf to
# $APP_DIR/config, so the script-relative path is the safe default.
DEPLOY_CONF="${DEPLOY_CONF:-}"

# Try to find deploy.conf from the script's own location first
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -z "$DEPLOY_CONF" && -f "${SCRIPT_DIR}/../config/deploy.conf" ]]; then
    DEPLOY_CONF="${SCRIPT_DIR}/../config/deploy.conf"
fi
DEPLOY_CONF="${DEPLOY_CONF:-${SCRIPT_DIR}/../config/deploy.conf}"

# -----------------------------------------------------------------------------
# Logging (prefixed with APP_ID)
# -----------------------------------------------------------------------------

log_info()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [${APP_ID:-init}] INFO  $*"; }
log_warn()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [${APP_ID:-init}] WARN  $*" >&2; }
log_error() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [${APP_ID:-init}] ERROR $*" >&2; }

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
        value="${!key:-}"
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

# -----------------------------------------------------------------------------
# Load config from deploy.conf + optional server .env fallback
# -----------------------------------------------------------------------------

load_config() {
    if [[ ! -f "$DEPLOY_CONF" ]]; then
        log_error "Config not found: $DEPLOY_CONF"
        log_error "Run scripts/setup.sh first."
        exit 1
    fi
    # shellcheck source=/dev/null
    source "$DEPLOY_CONF"

    : "${APP_NAME:?APP_NAME not set in $DEPLOY_CONF}"
    : "${ENVIRONMENT:?ENVIRONMENT not set in $DEPLOY_CONF}"
    : "${APP_ID:?APP_ID not set in $DEPLOY_CONF}"
    : "${APP_DIR:?APP_DIR not set in $DEPLOY_CONF}"
    : "${BINARY_NAME:?BINARY_NAME not set in $DEPLOY_CONF}"
    : "${POLL_INTERVAL:=30}"
    : "${RUN_USER:=forge}"

    ENV_FILE="$APP_DIR/.env"
    S3_BUCKET="$(first_config_value "$ENV_FILE" DEPLOY_BUCKET STORAGE__DISKS__R2__BUCKET STORAGE__DISKS__S3__BUCKET || true)"
    S3_REGION="$(first_config_value "$ENV_FILE" DEPLOY_REGION STORAGE__DISKS__R2__REGION STORAGE__DISKS__S3__REGION || true)"
    S3_ENDPOINT="$(first_config_value "$ENV_FILE" DEPLOY_ENDPOINT STORAGE__DISKS__R2__ENDPOINT STORAGE__DISKS__S3__ENDPOINT || true)"
    : "${S3_REGION:=auto}"
    : "${S3_ENDPOINT:=}"

    if [[ -z "$S3_BUCKET" ]]; then
        log_error "Deploy bucket is not configured."
        log_error "Set DEPLOY_BUCKET in $DEPLOY_CONF or $ENV_FILE."
        exit 1
    fi

    # Derived paths
    BIN_DIR="$APP_DIR/bin"
    BINARY="$BIN_DIR/$BINARY_NAME"
    LOCAL_VERSION_FILE="$APP_DIR/VERSION"
    LOCK_FILE="$APP_DIR/deploy-poll.lock"
    S3_PREFIX="s3://$S3_BUCKET/_deployments/$APP_NAME/$ENVIRONMENT"

    # Dynamic service names based on APP_ID
    FORGE_SERVICES=(
        "${APP_ID}-http"
        "${APP_ID}-worker"
        "${APP_ID}-scheduler"
        "${APP_ID}-websocket"
    )
}

# -----------------------------------------------------------------------------
# Lock file (prevent concurrent runs)
# -----------------------------------------------------------------------------

acquire_lock() {
    if [[ -f "$LOCK_FILE" ]]; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null || true)
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log_error "Another deploy-poll is running (PID $pid). Exiting."
            exit 1
        fi
        log_warn "Stale lock file found. Removing."
        rm -f "$LOCK_FILE"
    fi
    echo $$ > "$LOCK_FILE"
}

release_lock() {
    rm -f "${LOCK_FILE:-}" 2>/dev/null || true
}

# -----------------------------------------------------------------------------
# Graceful shutdown
# -----------------------------------------------------------------------------

shutdown() {
    log_info "Shutting down deploy-poll (signal received)."
    release_lock
    exit 0
}

trap shutdown SIGTERM SIGINT

# -----------------------------------------------------------------------------
# S3/R2 helpers
# -----------------------------------------------------------------------------

aws_s3() {
    local args=("s3")
    if [[ -n "$S3_ENDPOINT" ]]; then
        args+=(--endpoint-url "$S3_ENDPOINT")
    fi
    if [[ "$S3_REGION" != "auto" ]]; then
        args+=(--region "$S3_REGION")
    fi
    aws "${args[@]}" "$@"
}

s3_download() {
    local remote_path="$1"
    local local_path="$2"
    aws_s3 cp "$remote_path" "$local_path" --quiet 2>/dev/null
}

# -----------------------------------------------------------------------------
# Service management
# -----------------------------------------------------------------------------

stop_services() {
    log_info "Stopping services..."
    for svc in "${FORGE_SERVICES[@]}"; do
        if systemctl is-active --quiet "$svc" 2>/dev/null; then
            systemctl stop "$svc" || log_warn "Failed to stop $svc"
        fi
    done
    log_info "Services stopped."
}

start_services() {
    log_info "Starting services..."
    for svc in "${FORGE_SERVICES[@]}"; do
        if systemctl is-enabled --quiet "$svc" 2>/dev/null; then
            systemctl start "$svc" || log_warn "Failed to start $svc"
        fi
    done
    log_info "Services started."
}

# -----------------------------------------------------------------------------
# Version helpers
# -----------------------------------------------------------------------------

get_local_version() {
    if [[ -f "$LOCAL_VERSION_FILE" ]]; then
        cat "$LOCAL_VERSION_FILE"
    else
        echo ""
    fi
}

get_remote_version() {
    local tmp
    tmp=$(mktemp)
    if s3_download "$S3_PREFIX/VERSION" "$tmp"; then
        cat "$tmp"
        rm -f "$tmp"
        return 0
    fi
    rm -f "$tmp"
    return 1
}

# -----------------------------------------------------------------------------
# Deployment
# -----------------------------------------------------------------------------

deploy_version() {
    local version="$1"
    local tmp_dir
    tmp_dir=$(mktemp -d)
    local zip_file="$tmp_dir/${BINARY_NAME}-${version}.zip"
    local success=false

    log_info "Deploying version: $version"

    # Download artifact zip
    log_info "Downloading artifact..."
    if ! s3_download "$S3_PREFIX/${BINARY_NAME}-${version}.zip" "$zip_file"; then
        log_error "Failed to download artifact zip."
        rm -rf "$tmp_dir"
        return 1
    fi

    # Verify zip integrity
    if ! unzip -t "$zip_file" > /dev/null 2>&1; then
        log_error "Artifact zip is corrupt. Retrying once..."
        if ! s3_download "$S3_PREFIX/${BINARY_NAME}-${version}.zip" "$zip_file"; then
            log_error "Retry download failed."
            rm -rf "$tmp_dir"
            return 1
        fi
        if ! unzip -t "$zip_file" > /dev/null 2>&1; then
            log_error "Artifact zip still corrupt after retry. Aborting."
            rm -rf "$tmp_dir"
            return 1
        fi
    fi

    # Backup current binary
    if [[ -f "$BINARY" ]]; then
        cp "$BINARY" "${BINARY}.bak"
        log_info "Backed up current binary."
    fi

    # Stop services
    stop_services

    # Extract zip
    log_info "Extracting artifact..."
    local extract_dir="$tmp_dir/extracted"
    mkdir -p "$extract_dir"
    unzip -o "$zip_file" -d "$extract_dir" > /dev/null

    # Deploy binary
    if [[ -f "$extract_dir/$BINARY_NAME" ]]; then
        cp "$extract_dir/$BINARY_NAME" "$BINARY"
        chmod +x "$BINARY"
        chown "$RUN_USER:$RUN_USER" "$BINARY"
    else
        log_error "Binary '$BINARY_NAME' not found in artifact zip."
        if [[ -f "${BINARY}.bak" ]]; then
            cp "${BINARY}.bak" "$BINARY"
        fi
        start_services
        rm -rf "$tmp_dir"
        return 1
    fi

    # Deploy public assets
    if [[ -d "$extract_dir/public" ]]; then
        rm -rf "$APP_DIR/public/website" "$APP_DIR/public/admin" "$APP_DIR/public/user" "$APP_DIR/public/team"
        cp -r "$extract_dir/public/." "$APP_DIR/public/"
        chown -R "$RUN_USER:$RUN_USER" "$APP_DIR/public/"
        log_info "Deployed public assets."
    fi

    # Deploy config
    if [[ -d "$extract_dir/config" ]]; then
        # Preserve deploy.conf — only overwrite app config files
        find "$extract_dir/config" -maxdepth 1 -name '*.toml' -exec cp {} "$APP_DIR/config/" \;
        log_info "Deployed config files."
    fi

    # Deploy locales
    if [[ -d "$extract_dir/locales" ]]; then
        cp -r "$extract_dir/locales/." "$APP_DIR/locales/"
    fi

    # Deploy templates
    if [[ -d "$extract_dir/templates" ]]; then
        cp -r "$extract_dir/templates/." "$APP_DIR/templates/"
    fi

    # Deploy API docs
    if [[ -d "$extract_dir/docs" ]]; then
        mkdir -p "$APP_DIR/docs"
        cp -r "$extract_dir/docs/." "$APP_DIR/docs/"
    fi

    # Run database migrations before starting services
    log_info "Running database migrations..."
    if sudo -u "$RUN_USER" PROCESS=cli "$BINARY" db:migrate 2>&1; then
        log_info "Migrations complete."
    else
        log_error "Migration failed. Starting services with current schema."
    fi

    # Start services
    start_services

    # Verify at least the HTTP service started
    sleep 2
    local http_svc="${APP_ID}-http"
    if systemctl is-active --quiet "$http_svc" 2>/dev/null; then
        success=true
        log_info "$http_svc is running. Deployment successful."
    else
        log_error "$http_svc failed to start after deployment."
    fi

    if [[ "$success" = true ]]; then
        echo "$version" > "$LOCAL_VERSION_FILE"
        rm -f "${BINARY}.bak"
        log_info "Deployment complete: $version"
    else
        log_warn "Rolling back to previous binary..."
        if [[ -f "${BINARY}.bak" ]]; then
            cp "${BINARY}.bak" "$BINARY"
            chmod +x "$BINARY"
        fi
        start_services
        log_warn "Rollback complete. Continuing to poll."
    fi

    rm -rf "$tmp_dir"
    [[ "$success" = true ]]
}

# -----------------------------------------------------------------------------
# Main loop
# -----------------------------------------------------------------------------

main() {
    load_config
    acquire_lock

    log_info "Starting deploy-poll daemon."
    log_info "App:           $APP_ID"
    log_info "Bucket:        $S3_BUCKET"
    log_info "S3 prefix:     $S3_PREFIX"
    log_info "Binary:        $BINARY"
    log_info "Run user:      $RUN_USER"
    log_info "Poll interval: ${POLL_INTERVAL}s"

    while true; do
        local remote_version
        if ! remote_version=$(get_remote_version); then
            sleep "$POLL_INTERVAL"
            continue
        fi

        remote_version=$(echo "$remote_version" | tr -d '[:space:]')
        local local_version
        local_version=$(get_local_version | tr -d '[:space:]')

        if [[ -z "$remote_version" ]]; then
            sleep "$POLL_INTERVAL"
            continue
        fi

        if [[ "$remote_version" = "$local_version" ]]; then
            sleep "$POLL_INTERVAL"
            continue
        fi

        log_info "New version detected: $remote_version (current: ${local_version:-none})"

        if deploy_version "$remote_version"; then
            log_info "Successfully deployed $remote_version."
        else
            log_error "Deployment of $remote_version failed. Will retry next poll."
        fi

        sleep "$POLL_INTERVAL"
    done
}

main
