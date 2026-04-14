#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Forge — Deployment Poller
# Long-running daemon that polls S3/R2 for new versions and deploys them.
# Reads identity from deploy.conf, S3 config from config/storage.toml.
# Designed to run as a systemd service.
# =============================================================================

# -----------------------------------------------------------------------------
# Configuration — loaded from deploy.conf + storage.toml
# -----------------------------------------------------------------------------

# Default conf path; overridable via DEPLOY_CONF env var
DEPLOY_CONF="${DEPLOY_CONF:-/opt/forge-starter/config/deploy.conf}"

# Try to find deploy.conf from the script's own location first
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/../config/deploy.conf" ]]; then
    DEPLOY_CONF="${SCRIPT_DIR}/../config/deploy.conf"
fi

# -----------------------------------------------------------------------------
# Logging (prefixed with APP_ID)
# -----------------------------------------------------------------------------

log_info()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [${APP_ID:-init}] INFO  $*"; }
log_warn()  { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [${APP_ID:-init}] WARN  $*" >&2; }
log_error() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] [${APP_ID:-init}] ERROR $*" >&2; }

# -----------------------------------------------------------------------------
# Parse S3 config from storage.toml
# -----------------------------------------------------------------------------

parse_storage_toml() {
    local toml="${APP_DIR}/config/storage.toml"
    if [[ ! -f "$toml" ]]; then
        log_error "storage.toml not found at $toml"
        log_error "Deploy an artifact first, or place config/storage.toml manually."
        return 1
    fi

    # Read default disk name from [storage] default = "..."
    local default_disk
    default_disk="$(grep -oP '^\s*default\s*=\s*"\K[^"]+' "$toml" | head -1)"
    if [[ -z "$default_disk" ]]; then
        log_error "No default disk set in $toml"
        return 1
    fi

    # Read config from [storage.disks.{default}]
    local section="storage\\.disks\\.${default_disk}"
    S3_BUCKET="$(grep -A20 "^\[${section}\]" "$toml" | grep '^\s*bucket' | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')"
    S3_REGION="$(grep -A20 "^\[${section}\]" "$toml" | grep '^\s*region' | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')"
    S3_ENDPOINT="$(grep -A20 "^\[${section}\]" "$toml" | grep '^\s*endpoint' | head -1 | sed 's/.*=\s*"\(.*\)"/\1/')"

    # Default region to auto if empty
    : "${S3_REGION:=auto}"
    : "${S3_ENDPOINT:=}"

    if [[ -z "$S3_BUCKET" ]]; then
        log_error "S3 bucket not configured in $toml"
        log_error "Set the bucket field in your default storage disk in config/storage.toml"
        return 1
    fi
}

# -----------------------------------------------------------------------------
# Load config from deploy.conf + storage.toml
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

    # Parse S3 config from storage.toml
    if ! parse_storage_toml; then
        log_error "Failed to load S3 config from storage.toml. Cannot start polling."
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
    local env_file="$tmp_dir/.env.new"
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

    # Download .env (optional)
    local has_new_env=false
    if s3_download "$S3_PREFIX/.env" "$env_file"; then
        has_new_env=true
        log_info "Downloaded .env from bucket."
    else
        log_info "No .env in bucket (using existing)."
    fi

    # Backup current binary
    if [[ -f "$BINARY" ]]; then
        cp "$BINARY" "${BINARY}.bak"
        log_info "Backed up current binary."
    fi

    # Backup current .env
    if [[ -f "$APP_DIR/.env" ]]; then
        cp "$APP_DIR/.env" "$APP_DIR/.env.bak"
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
        chown forge:forge "$BINARY"
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
        rm -rf "$APP_DIR/public/admin" "$APP_DIR/public/user"
        cp -r "$extract_dir/public/." "$APP_DIR/public/"
        chown -R forge:forge "$APP_DIR/public/"
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

    # Deploy .env if downloaded
    if [[ "$has_new_env" = true ]]; then
        cp "$env_file" "$APP_DIR/.env"
        chmod 600 "$APP_DIR/.env"
        chown forge:forge "$APP_DIR/.env"
        log_info "Deployed .env from bucket."
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
        rm -f "${BINARY}.bak" "$APP_DIR/.env.bak"
        log_info "Deployment complete: $version"
    else
        log_warn "Rolling back to previous binary..."
        if [[ -f "${BINARY}.bak" ]]; then
            cp "${BINARY}.bak" "$BINARY"
            chmod +x "$BINARY"
        fi
        if [[ -f "$APP_DIR/.env.bak" ]]; then
            cp "$APP_DIR/.env.bak" "$APP_DIR/.env"
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
    log_info "Bucket:        $S3_BUCKET (from storage.toml)"
    log_info "S3 prefix:     $S3_PREFIX"
    log_info "Binary:        $BINARY"
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
