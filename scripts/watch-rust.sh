#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly POLL_INTERVAL_SECONDS="${DEV_WATCH_INTERVAL:-1}"

WATCH_PATHS=(
    "${PROJECT_ROOT}/src"
    "${PROJECT_ROOT}/config"
    "${PROJECT_ROOT}/database"
    "${PROJECT_ROOT}/locales"
    "${PROJECT_ROOT}/templates"
    "${PROJECT_ROOT}/tests"
    "${PROJECT_ROOT}/Cargo.toml"
    "${PROJECT_ROOT}/Cargo.lock"
    "${PROJECT_ROOT}/build.rs"
)

readonly WATCH_EXTENSIONS=(
    "*.rs"
    "*.sql"
    "*.json"
    "*.toml"
    "*.tera"
    "*.html"
    "*.yml"
    "*.yaml"
)

if [[ "$#" -eq 0 ]]; then
    echo "Usage: $0 <command> [args...]"
    exit 1
fi

if stat -f '%m %N' "${PROJECT_ROOT}/Cargo.toml" >/dev/null 2>&1; then
    readonly STAT_FORMAT='%m %N'
    readonly STAT_ARGS=(-f "${STAT_FORMAT}")
else
    readonly STAT_FORMAT='%Y %n'
    readonly STAT_ARGS=(-c "${STAT_FORMAT}")
fi

child_pid=""
child_exit_reported=false

log() {
    printf '[watch-rust] %s\n' "$*"
}

collect_files() {
    local path
    local pattern_args=()
    local first_pattern=true

    for pattern in "${WATCH_EXTENSIONS[@]}"; do
        if [[ "${first_pattern}" == true ]]; then
            first_pattern=false
        else
            pattern_args+=(-o)
        fi
        pattern_args+=(-name "${pattern}")
    done

    for path in "${WATCH_PATHS[@]}"; do
        [[ -e "${path}" ]] || continue

        if [[ -d "${path}" ]]; then
            find "${path}" -type f \( "${pattern_args[@]}" \) -print
        else
            printf '%s\n' "${path}"
        fi
    done
}

snapshot() {
    mapfile -t files < <(collect_files | LC_ALL=C sort)

    if [[ "${#files[@]}" -eq 0 ]]; then
        return 0
    fi

    stat "${STAT_ARGS[@]}" "${files[@]}" | LC_ALL=C sort
}

stop_child() {
    local pid="${child_pid}"
    if [[ -z "${pid}" ]]; then
        return
    fi

    if kill -0 "${pid}" 2>/dev/null; then
        pkill -TERM -P "${pid}" 2>/dev/null || true
        kill -TERM "${pid}" 2>/dev/null || true

        local deadline=$((SECONDS + 5))
        while kill -0 "${pid}" 2>/dev/null && (( SECONDS < deadline )); do
            sleep 0.1
        done

        if kill -0 "${pid}" 2>/dev/null; then
            pkill -KILL -P "${pid}" 2>/dev/null || true
            kill -KILL "${pid}" 2>/dev/null || true
        fi
    fi

    wait "${pid}" 2>/dev/null || true
    child_pid=""
}

start_child() {
    log "starting: $*"
    "$@" &
    child_pid=$!
    child_exit_reported=false
}

cleanup() {
    stop_child
}

trap cleanup EXIT INT TERM

last_snapshot="$(snapshot)"
start_child "$@"

while true; do
    if [[ -n "${child_pid}" ]] && ! kill -0 "${child_pid}" 2>/dev/null; then
        wait "${child_pid}" 2>/dev/null || true
        child_pid=""

        if [[ "${child_exit_reported}" == false ]]; then
            log "process exited; waiting for changes..."
            child_exit_reported=true
        fi
    fi

    sleep "${POLL_INTERVAL_SECONDS}"

    next_snapshot="$(snapshot)"
    if [[ "${next_snapshot}" != "${last_snapshot}" ]]; then
        last_snapshot="${next_snapshot}"
        log "change detected; restarting..."
        stop_child
        start_child "$@"
    fi
done
