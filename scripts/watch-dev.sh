#!/usr/bin/env bash
set -euo pipefail

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly POLL_INTERVAL_SECONDS="${DEV_WATCH_INTERVAL:-1}"
readonly PORT_WAIT_SECONDS="${DEV_PORT_WAIT_SECONDS:-10}"
readonly BINARY="${PROJECT_ROOT}/target/debug/app"

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

WATCH_EXTENSIONS=(
    "*.rs"
    "*.sql"
    "*.json"
    "*.toml"
    "*.tera"
    "*.html"
    "*.yml"
    "*.yaml"
)

OWNED_PORTS=(3000 3010)

if [[ "$#" -eq 0 ]]; then
    echo "Usage: $0 <process> [process...]"
    echo "Example: $0 http websocket scheduler"
    exit 1
fi

if stat -f '%m %N' "${PROJECT_ROOT}/Cargo.toml" >/dev/null 2>&1; then
    readonly STAT_FORMAT='%m %N'
    readonly STAT_ARGS=(-f "${STAT_FORMAT}")
else
    readonly STAT_FORMAT='%Y %n'
    readonly STAT_ARGS=(-c "${STAT_FORMAT}")
fi

process_names=("$@")
process_pids=()
restart_pending=false

log() {
    printf '[watch-dev] %s\n' "$*"
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
    local file

    collect_files | LC_ALL=C sort | while IFS= read -r file; do
        [[ -e "${file}" ]] || continue
        stat "${STAT_ARGS[@]}" "${file}"
    done | LC_ALL=C sort
}

clear_process_pids() {
    local i

    for (( i = 0; i < ${#process_names[@]}; i++ )); do
        process_pids[$i]=""
    done
}

managed_processes_running() {
    local i
    local pid

    for (( i = 0; i < ${#process_names[@]}; i++ )); do
        pid="${process_pids[$i]:-}"
        [[ -n "${pid}" ]] || continue

        if kill -0 "${pid}" 2>/dev/null; then
            return 0
        fi
    done

    return 1
}

stop_processes() {
    local i
    local pid

    for (( i = 0; i < ${#process_names[@]}; i++ )); do
        pid="${process_pids[$i]:-}"
        [[ -n "${pid}" ]] || continue

        if kill -0 "${pid}" 2>/dev/null; then
            pkill -TERM -P "${pid}" 2>/dev/null || true
            kill -TERM "${pid}" 2>/dev/null || true
        fi
    done

    local deadline=$((SECONDS + 5))
    while managed_processes_running && (( SECONDS < deadline )); do
        sleep 0.1
    done

    for (( i = 0; i < ${#process_names[@]}; i++ )); do
        pid="${process_pids[$i]:-}"
        [[ -n "${pid}" ]] || continue

        if kill -0 "${pid}" 2>/dev/null; then
            pkill -KILL -P "${pid}" 2>/dev/null || true
            kill -KILL "${pid}" 2>/dev/null || true
        fi
    done

    for (( i = 0; i < ${#process_names[@]}; i++ )); do
        pid="${process_pids[$i]:-}"
        [[ -n "${pid}" ]] || continue
        wait "${pid}" 2>/dev/null || true
    done

    clear_process_pids
}

port_pids() {
    local port="$1"

    lsof -ti:"${port}" 2>/dev/null || true
}

ports_are_free() {
    local port

    for port in "${OWNED_PORTS[@]}"; do
        if [[ -n "$(port_pids "${port}")" ]]; then
            return 1
        fi
    done

    return 0
}

wait_for_ports() {
    if ! command -v lsof >/dev/null 2>&1; then
        log "lsof not found; skipping port wait"
        return 0
    fi

    local deadline=$((SECONDS + PORT_WAIT_SECONDS))
    local reported_wait=false
    local port
    local pids

    while ! ports_are_free && (( SECONDS < deadline )); do
        if [[ "${reported_wait}" == false ]]; then
            log "waiting for ports 3000 and 3010 to be free..."
            reported_wait=true
        fi
        sleep 0.1
    done

    for port in "${OWNED_PORTS[@]}"; do
        pids="$(port_pids "${port}")"
        if [[ -n "${pids}" ]]; then
            log "port ${port} is still busy (pid ${pids})"
            return 1
        fi
    done

    return 0
}

build_once() {
    log "building: cargo build"
    (cd "${PROJECT_ROOT}" && cargo build)
}

start_processes() {
    local i
    local name

    for (( i = 0; i < ${#process_names[@]}; i++ )); do
        name="${process_names[$i]}"

        if [[ "${name}" == "http" ]]; then
            log "starting http: ${BINARY}"
            (unset PROCESS; exec "${BINARY}") &
        else
            log "starting ${name}: PROCESS=${name} ${BINARY}"
            PROCESS="${name}" "${BINARY}" &
        fi

        process_pids[$i]=$!
    done
}

restart_processes() {
    local reason="$1"

    restart_pending=false
    log "${reason}"
    stop_processes

    if ! wait_for_ports; then
        restart_pending=true
        log "ports are still busy; retrying soon..."
        return
    fi

    if build_once; then
        start_processes
    else
        log "cargo build failed; waiting for changes..."
    fi
}

report_exited_processes() {
    local i
    local name
    local pid

    for (( i = 0; i < ${#process_names[@]}; i++ )); do
        pid="${process_pids[$i]:-}"
        [[ -n "${pid}" ]] || continue

        if ! kill -0 "${pid}" 2>/dev/null; then
            name="${process_names[$i]}"
            wait "${pid}" 2>/dev/null || true
            process_pids[$i]=""
            log "${name} exited; waiting for changes..."
        fi
    done
}

cleanup() {
    trap - EXIT INT TERM
    stop_processes
}

handle_signal() {
    cleanup
    exit 0
}

trap cleanup EXIT
trap handle_signal INT TERM

clear_process_pids
last_snapshot="$(snapshot)"
restart_processes "initial build and start"
last_snapshot="$(snapshot)"

while true; do
    report_exited_processes
    sleep "${POLL_INTERVAL_SECONDS}"

    if [[ "${restart_pending}" == true ]]; then
        restart_processes "retrying start after busy ports..."
        last_snapshot="$(snapshot)"
        continue
    fi

    next_snapshot="$(snapshot)"
    if [[ "${next_snapshot}" != "${last_snapshot}" ]]; then
        restart_processes "change detected; rebuilding and restarting..."
        last_snapshot="$(snapshot)"
    fi
done
