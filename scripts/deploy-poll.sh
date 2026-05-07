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
LOCK_FD=200
LOCK_HELD=false

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

sha256_file() {
    local file="$1"

    if command -v sha256sum &>/dev/null; then
        sha256sum "$file" | awk '{ print $1 }'
        return 0
    fi
    if command -v shasum &>/dev/null; then
        shasum -a 256 "$file" | awk '{ print $1 }'
        return 0
    fi

    log_error "No SHA-256 tool found. Install sha256sum or shasum."
    return 1
}

non_negative_integer_or_default() {
    local value="$1"
    local fallback="$2"

    if [[ "$value" =~ ^[0-9]+$ ]]; then
        printf '%s' "$value"
    else
        printf '%s' "$fallback"
    fi
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
    : "${DEPLOY_PREFLIGHT_ENABLED:=1}"
    : "${DEPLOY_HEALTH_TIMEOUT_SECONDS:=30}"
    : "${DEPLOY_MIGRATION_LOCK_TIMEOUT_MS:=0}"

    POLL_INTERVAL="$(non_negative_integer_or_default "$POLL_INTERVAL" 30)"
    DEPLOY_PREFLIGHT_ENABLED="$(non_negative_integer_or_default "$DEPLOY_PREFLIGHT_ENABLED" 1)"
    DEPLOY_HEALTH_TIMEOUT_SECONDS="$(non_negative_integer_or_default "$DEPLOY_HEALTH_TIMEOUT_SECONDS" 30)"
    DEPLOY_MIGRATION_LOCK_TIMEOUT_MS="$(non_negative_integer_or_default "$DEPLOY_MIGRATION_LOCK_TIMEOUT_MS" 0)"

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

    cd "$APP_DIR"

    # Derived paths
    BIN_DIR="$APP_DIR/bin"
    BINARY="$BIN_DIR/$BINARY_NAME"
    LOCAL_VERSION_FILE="$APP_DIR/VERSION"
    LOCK_FILE="$APP_DIR/deploy-poll.lock"
    DEPLOY_MANIFEST_FILE="$APP_DIR/DEPLOY_MANIFEST"
    DEPLOY_CHECKSUM_FILE="$APP_DIR/DEPLOY_SHA256"
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
    if ! command -v flock &>/dev/null; then
        log_error "'flock' is required for deploy locking. Install util-linux."
        exit 1
    fi

    exec 200>"$LOCK_FILE"
    if ! flock -n "$LOCK_FD"; then
        log_error "Another deploy-poll or deploy-once process is already running for $APP_ID."
        exit 1
    fi

    LOCK_HELD=true
    printf '%s\n' "$$" >&200
}

release_lock() {
    if [[ "$LOCK_HELD" == true ]]; then
        flock -u "$LOCK_FD" 2>/dev/null || true
        LOCK_HELD=false
    fi
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
    if [[ -n "$S3_REGION" ]]; then
        args+=(--region "$S3_REGION")
    fi
    aws "${args[@]}" "$@"
}

s3_download() {
    local remote_path="$1"
    local local_path="$2"
    aws_s3 cp "$remote_path" "$local_path" --quiet 2>/dev/null
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
        log_error "Artifact is missing the compiled binary: $BINARY_NAME"
        return 1
    fi

    if [[ ${#unsafe_entries[@]} -gt 0 ]]; then
        log_error "Artifact contains forbidden or non-runtime paths:"
        printf '  %s\n' "${unsafe_entries[@]:0:25}" >&2
        if [[ ${#unsafe_entries[@]} -gt 25 ]]; then
            log_error "...and $(( ${#unsafe_entries[@]} - 25 )) more."
        fi
        return 1
    fi

    return 0
}

manifest_value() {
    local manifest="$1"
    local key="$2"
    env_file_value "$key" "$manifest"
}

verify_release_metadata() {
    local version="$1"
    local zip_path="$2"
    local checksum_path="$3"
    local manifest_path="$4"
    local expected_sha actual_sha manifest_version manifest_artifact manifest_sha

    if [[ ! -f "$checksum_path" ]]; then
        log_error "Artifact checksum file is missing."
        return 1
    fi
    if [[ ! -f "$manifest_path" ]]; then
        log_error "Artifact manifest file is missing."
        return 1
    fi

    expected_sha="$(awk 'NF >= 1 { print $1; exit }' "$checksum_path")"
    if [[ -z "$expected_sha" ]]; then
        log_error "Artifact checksum file is empty."
        return 1
    fi
    actual_sha="$(sha256_file "$zip_path")" || return 1
    if [[ "$actual_sha" != "$expected_sha" ]]; then
        log_error "Artifact checksum mismatch for version $version."
        log_error "Expected: $expected_sha"
        log_error "Actual:   $actual_sha"
        return 1
    fi

    manifest_version="$(manifest_value "$manifest_path" VERSION || true)"
    manifest_artifact="$(manifest_value "$manifest_path" ARTIFACT || true)"
    manifest_sha="$(manifest_value "$manifest_path" SHA256 || true)"

    if [[ "$manifest_version" != "$version" ]]; then
        log_error "Artifact manifest VERSION mismatch: expected $version, got ${manifest_version:-<empty>}."
        return 1
    fi
    if [[ "$manifest_artifact" != "${BINARY_NAME}-${version}.zip" ]]; then
        log_error "Artifact manifest ARTIFACT mismatch: got ${manifest_artifact:-<empty>}."
        return 1
    fi
    if [[ "$manifest_sha" != "$actual_sha" ]]; then
        log_error "Artifact manifest SHA256 mismatch."
        return 1
    fi

    log_info "Artifact checksum and manifest verified."
    return 0
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

enabled_forge_services() {
    local svc
    for svc in "${FORGE_SERVICES[@]}"; do
        if systemctl is-enabled --quiet "$svc" 2>/dev/null; then
            printf '%s\n' "$svc"
        fi
    done
}

wait_for_services_healthy() {
    local deadline failed svc
    deadline=$(( $(date +%s) + DEPLOY_HEALTH_TIMEOUT_SECONDS ))

    while true; do
        failed=()
        while IFS= read -r svc; do
            [[ -z "$svc" ]] && continue
            if ! systemctl is-active --quiet "$svc" 2>/dev/null; then
                failed+=("$svc")
            fi
        done < <(enabled_forge_services)

        if [[ ${#failed[@]} -eq 0 ]]; then
            log_info "All enabled Forge services are active."
            return 0
        fi

        if (( $(date +%s) >= deadline )); then
            log_error "Services failed to become active before timeout: ${failed[*]}"
            return 1
        fi

        sleep 1
    done
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
# Runtime file deployment helpers
# -----------------------------------------------------------------------------

backup_runtime_files() {
    local backup_dir="$1"

    mkdir -p "$backup_dir"
    if [[ -f "$BINARY" ]]; then
        mkdir -p "$backup_dir/bin"
        cp -a "$BINARY" "$backup_dir/bin/$BINARY_NAME"
    fi
    for path in public locales templates docs; do
        if [[ -e "$APP_DIR/$path" ]]; then
            cp -a "$APP_DIR/$path" "$backup_dir/$path"
        fi
    done
    mkdir -p "$backup_dir/config"
    find "$APP_DIR/config" -maxdepth 1 -name '*.toml' -exec cp -a {} "$backup_dir/config/" \;
    if [[ -f "$LOCAL_VERSION_FILE" ]]; then
        cp -a "$LOCAL_VERSION_FILE" "$backup_dir/VERSION"
    fi
    if [[ -f "$DEPLOY_MANIFEST_FILE" ]]; then
        cp -a "$DEPLOY_MANIFEST_FILE" "$backup_dir/DEPLOY_MANIFEST"
    fi
    if [[ -f "$DEPLOY_CHECKSUM_FILE" ]]; then
        cp -a "$DEPLOY_CHECKSUM_FILE" "$backup_dir/DEPLOY_SHA256"
    fi
}

restore_runtime_files() {
    local backup_dir="$1"

    if [[ ! -f "$backup_dir/bin/$BINARY_NAME" ]]; then
        log_error "No previous binary backup exists; services were left stopped."
        return 1
    fi

    mkdir -p "$BIN_DIR" "$APP_DIR/config"
    cp -a "$backup_dir/bin/$BINARY_NAME" "$BINARY"
    chmod +x "$BINARY"
    chown "$RUN_USER:$RUN_USER" "$BINARY"

    for path in public locales templates docs; do
        rm -rf "$APP_DIR/$path"
        if [[ -e "$backup_dir/$path" ]]; then
            cp -a "$backup_dir/$path" "$APP_DIR/$path"
        else
            mkdir -p "$APP_DIR/$path"
        fi
    done

    find "$APP_DIR/config" -maxdepth 1 -name '*.toml' -delete
    if [[ -d "$backup_dir/config" ]]; then
        find "$backup_dir/config" -maxdepth 1 -name '*.toml' -exec cp -a {} "$APP_DIR/config/" \;
    fi

    if [[ -f "$backup_dir/VERSION" ]]; then
        cp -a "$backup_dir/VERSION" "$LOCAL_VERSION_FILE"
    else
        rm -f "$LOCAL_VERSION_FILE"
    fi
    if [[ -f "$backup_dir/DEPLOY_MANIFEST" ]]; then
        cp -a "$backup_dir/DEPLOY_MANIFEST" "$DEPLOY_MANIFEST_FILE"
    else
        rm -f "$DEPLOY_MANIFEST_FILE"
    fi
    if [[ -f "$backup_dir/DEPLOY_SHA256" ]]; then
        cp -a "$backup_dir/DEPLOY_SHA256" "$DEPLOY_CHECKSUM_FILE"
    else
        rm -f "$DEPLOY_CHECKSUM_FILE"
    fi

    chown -R "$RUN_USER:$RUN_USER" "$APP_DIR/public" "$APP_DIR/locales" "$APP_DIR/templates" "$APP_DIR/docs" "$APP_DIR/config"
    return 0
}

deploy_runtime_files() {
    local extract_dir="$1"

    mkdir -p "$BIN_DIR" "$APP_DIR/config"
    cp -a "$extract_dir/$BINARY_NAME" "$BINARY"
    chmod +x "$BINARY"
    chown "$RUN_USER:$RUN_USER" "$BINARY"

    for path in public locales templates docs; do
        rm -rf "$APP_DIR/$path"
        if [[ -d "$extract_dir/$path" ]]; then
            cp -a "$extract_dir/$path" "$APP_DIR/$path"
        else
            mkdir -p "$APP_DIR/$path"
        fi
    done

    find "$APP_DIR/config" -maxdepth 1 -name '*.toml' -delete
    if [[ -d "$extract_dir/config" ]]; then
        find "$extract_dir/config" -maxdepth 1 -name '*.toml' -exec cp -a {} "$APP_DIR/config/" \;
    fi

    chown -R "$RUN_USER:$RUN_USER" "$APP_DIR/public" "$APP_DIR/locales" "$APP_DIR/templates" "$APP_DIR/docs" "$APP_DIR/config"
}

run_doctor_for_binary() {
    local binary="$1"
    local force="${2:-0}"

    if (( DEPLOY_PREFLIGHT_ENABLED == 0 && force == 0 )); then
        log_warn "Deploy preflight disabled by DEPLOY_PREFLIGHT_ENABLED=0."
        return 0
    fi

    log_info "Running Forge doctor preflight..."
    sudo -u "$RUN_USER" env PROCESS=cli "$binary" doctor --deploy --json
}

run_migrations() {
    local args=(db:migrate)

    if (( DEPLOY_MIGRATION_LOCK_TIMEOUT_MS > 0 )); then
        args+=(--lock-timeout-ms "$DEPLOY_MIGRATION_LOCK_TIMEOUT_MS")
    fi

    sudo -u "$RUN_USER" env PROCESS=cli "$BINARY" "${args[@]}"
}

# -----------------------------------------------------------------------------
# Deployment
# -----------------------------------------------------------------------------

deploy_version() {
    local version="$1"
    local tmp_dir
    tmp_dir=$(mktemp -d)
    chmod 755 "$tmp_dir"
    local zip_file="$tmp_dir/${BINARY_NAME}-${version}.zip"
    local checksum_file="$tmp_dir/${BINARY_NAME}-${version}.zip.sha256"
    local manifest_file="$tmp_dir/${BINARY_NAME}-${version}.manifest"
    local backup_dir="$tmp_dir/backup"
    local success=false

    log_info "Deploying version: $version"

    # Download artifact zip
    log_info "Downloading artifact..."
    if ! s3_download "$S3_PREFIX/${BINARY_NAME}-${version}.zip" "$zip_file"; then
        log_error "Failed to download artifact zip."
        rm -rf "$tmp_dir"
        return 1
    fi
    if ! s3_download "$S3_PREFIX/${BINARY_NAME}-${version}.zip.sha256" "$checksum_file"; then
        log_error "Failed to download artifact checksum."
        rm -rf "$tmp_dir"
        return 1
    fi
    if ! s3_download "$S3_PREFIX/${BINARY_NAME}-${version}.manifest" "$manifest_file"; then
        log_error "Failed to download artifact manifest."
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
    if ! verify_release_metadata "$version" "$zip_file" "$checksum_file" "$manifest_file"; then
        rm -rf "$tmp_dir"
        return 1
    fi
    if ! verify_artifact_zip "$zip_file"; then
        log_error "Artifact failed runtime-only safety checks."
        rm -rf "$tmp_dir"
        return 1
    fi

    # Extract zip
    log_info "Extracting artifact..."
    local extract_dir="$tmp_dir/extracted"
    mkdir -p "$extract_dir"
    unzip -o "$zip_file" -d "$extract_dir" > /dev/null
    chmod -R a+rX "$extract_dir"

    if [[ ! -f "$extract_dir/$BINARY_NAME" ]]; then
        log_error "Binary '$BINARY_NAME' not found in artifact zip."
        rm -rf "$tmp_dir"
        return 1
    fi
    if [[ ! -x "$extract_dir/$BINARY_NAME" ]]; then
        log_error "Artifact binary '$BINARY_NAME' is not executable."
        rm -rf "$tmp_dir"
        return 1
    fi

    if ! run_doctor_for_binary "$extract_dir/$BINARY_NAME"; then
        log_error "Forge doctor preflight failed. Current services were not stopped."
        rm -rf "$tmp_dir"
        return 1
    fi

    backup_runtime_files "$backup_dir"
    log_info "Backed up current runtime files."

    # Stop services
    stop_services

    deploy_runtime_files "$extract_dir"
    cp -a "$manifest_file" "$DEPLOY_MANIFEST_FILE"
    cp -a "$checksum_file" "$DEPLOY_CHECKSUM_FILE"
    chown "$RUN_USER:$RUN_USER" "$DEPLOY_MANIFEST_FILE" "$DEPLOY_CHECKSUM_FILE"
    log_info "Deployed runtime files."

    # Run database migrations before starting services
    log_info "Running database migrations..."
    local migrations_ok=false
    if run_migrations 2>&1; then
        migrations_ok=true
        log_info "Migrations complete."
    else
        log_error "Migration failed. Rolling back before starting services."
    fi

    if [[ "$migrations_ok" = true ]]; then
        # Start services
        start_services

        if wait_for_services_healthy; then
            success=true
            log_info "Deployment services are running."
        else
            log_error "One or more services failed to start after deployment."
        fi
    fi

    if [[ "$success" = true ]]; then
        echo "$version" > "$LOCAL_VERSION_FILE"
        chown "$RUN_USER:$RUN_USER" "$LOCAL_VERSION_FILE"
        log_info "Deployment complete: $version"
    else
        if [[ "$migrations_ok" = true ]]; then
            log_warn "Migrations already ran; restoring runtime files only. Database schema may be forward-migrated."
        fi
        log_warn "Rolling back runtime files..."
        if restore_runtime_files "$backup_dir"; then
            start_services
            wait_for_services_healthy || log_warn "Rollback services did not all become active."
            log_warn "Runtime rollback complete. Continuing to poll."
        fi
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
    trap release_lock EXIT

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

deploy_once() {
    local version="${1:-}"

    load_config
    acquire_lock
    trap release_lock EXIT

    if [[ -z "$version" ]]; then
        log_info "Fetching remote VERSION for one-shot deploy."
        if ! version=$(get_remote_version); then
            log_error "Could not read remote VERSION."
            return 1
        fi
    fi

    version=$(echo "$version" | tr -d '[:space:]')
    if [[ -z "$version" ]]; then
        log_error "Version is empty."
        return 1
    fi

    log_info "Starting one-shot deploy for version: $version"
    if deploy_version "$version"; then
        log_info "One-shot deploy complete: $version"
        return 0
    fi

    log_error "One-shot deploy failed: $version"
    return 1
}

deploy_check() {
    local version="${1:-}"
    local tmp_dir zip_file checksum_file manifest_file extract_dir

    load_config

    if [[ -z "$version" ]]; then
        log_info "Fetching remote VERSION for deploy check."
        if ! version=$(get_remote_version); then
            log_error "Could not read remote VERSION."
            return 1
        fi
    fi

    version=$(echo "$version" | tr -d '[:space:]')
    if [[ -z "$version" ]]; then
        log_error "Version is empty."
        return 1
    fi

    tmp_dir=$(mktemp -d)
    chmod 755 "$tmp_dir"
    zip_file="$tmp_dir/${BINARY_NAME}-${version}.zip"
    checksum_file="$tmp_dir/${BINARY_NAME}-${version}.zip.sha256"
    manifest_file="$tmp_dir/${BINARY_NAME}-${version}.manifest"
    extract_dir="$tmp_dir/extracted"

    log_info "Checking deploy artifact version: $version"
    if ! s3_download "$S3_PREFIX/${BINARY_NAME}-${version}.zip" "$zip_file" \
        || ! s3_download "$S3_PREFIX/${BINARY_NAME}-${version}.zip.sha256" "$checksum_file" \
        || ! s3_download "$S3_PREFIX/${BINARY_NAME}-${version}.manifest" "$manifest_file"; then
        log_error "Failed to download deploy artifact, checksum, or manifest."
        rm -rf "$tmp_dir"
        return 1
    fi

    if ! unzip -t "$zip_file" > /dev/null 2>&1 \
        || ! verify_release_metadata "$version" "$zip_file" "$checksum_file" "$manifest_file" \
        || ! verify_artifact_zip "$zip_file"; then
        rm -rf "$tmp_dir"
        return 1
    fi

    mkdir -p "$extract_dir"
    unzip -o "$zip_file" -d "$extract_dir" > /dev/null
    chmod -R a+rX "$extract_dir"
    if [[ ! -x "$extract_dir/$BINARY_NAME" ]]; then
        log_error "Artifact binary '$BINARY_NAME' is not executable."
        rm -rf "$tmp_dir"
        return 1
    fi

    run_doctor_for_binary "$extract_dir/$BINARY_NAME" 1
    local status=$?
    rm -rf "$tmp_dir"
    return "$status"
}

doctor_current() {
    load_config
    if [[ ! -x "$BINARY" ]]; then
        log_error "Current binary is missing or not executable: $BINARY"
        return 1
    fi
    run_doctor_for_binary "$BINARY" 1
}

list_versions() {
    load_config
    aws_s3 ls "${S3_PREFIX}/" \
        | awk -v binary="$BINARY_NAME" '$4 ~ "^" binary "-.*\\.zip$" {
            name = $4
            sub("^" binary "-", "", name)
            sub("\\.zip$", "", name)
            print $1, $2, name
        }'
}

usage() {
    cat <<USAGE
Usage:
  $0                 Poll forever for systemd.
  $0 poll            Poll forever for systemd.
  $0 deploy-once     Deploy the current remote VERSION immediately.
  $0 deploy-once <version>
                     Deploy a specific artifact version immediately.
  $0 deploy-check
                     Verify the current remote VERSION without stopping services.
  $0 deploy-check <version>
                     Verify a specific artifact without stopping services.
  $0 doctor          Run Forge doctor against the currently deployed binary.
  $0 versions        List artifact versions in the deploy bucket.
USAGE
}

case "${1:-poll}" in
    poll)
        main
        ;;
    deploy-once)
        shift
        deploy_once "${1:-}"
        ;;
    deploy-check)
        shift
        deploy_check "${1:-}"
        ;;
    doctor)
        doctor_current
        ;;
    versions)
        list_versions
        ;;
    *)
        usage >&2
        exit 1
        ;;
esac
