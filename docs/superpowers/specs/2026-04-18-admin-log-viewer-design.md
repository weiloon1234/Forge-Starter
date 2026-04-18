# Admin Log Viewer — Design

**Date:** 2026-04-18
**Portal:** admin
**Status:** approved

## Goal

Provide admin operators with a web UI to inspect and manage the framework's daily JSONL log files (`logs/YYYY-MM-DD.log`): list available files, view recent entries with level filtering, expand a single entry as pretty JSON, and delete a log file when no longer needed.

## Scope

- Read tail of the most recent N entries (default 500), newest first
- Filter by log level server-side
- Per-row pretty JSON modal
- Delete a log file with confirmation
- Auto-select the newest log file on page mount

Out of scope: full pagination, free-text search, live tail / auto-refresh, log retention policy, export/download. These can be added later if needed.

## Permissions

`Guard::Admin` only — no fine-grained permission. Permission system is on the roadmap; once it lands, swap to `logs:view` / `logs:delete`.

## Backend

### Routes (`src/portals/admin/mod.rs`)

Registered under existing `/admin` group:

| Name | Method | Path | Handler |
|------|--------|------|---------|
| `admin.logs.index` | GET | `/logs` | `log_routes::index` |
| `admin.logs.show` | GET | `/logs/{filename}` | `log_routes::show` |
| `admin.logs.destroy` | DELETE | `/logs/{filename}` | `log_routes::destroy` |

Each route uses `route_named_with_options` with `RouteDoc`, `Guard::Admin`, tag `admin:logs`.

### Handlers (`src/portals/admin/log_routes.rs`)

Thin (~5 lines): extract path/query, call `log_service`, return JSON.

```rust
pub async fn index(State(app): State<AppContext>) -> Result<impl IntoResponse>;
pub async fn show(State(app), Path(filename), Query(q): Query<LogQuery>) -> Result<impl IntoResponse>;
pub async fn destroy(State(app), i18n, Path(filename)) -> Result<impl IntoResponse>;
```

### Service (`src/domain/services/log_service.rs`)

Three functions, all portal-less:

- `list_files() -> Result<Vec<LogFileInfo>>` — read entries in `logs/`, filter to `YYYY-MM-DD.log`, sort newest first, attach `size_bytes` and `modified_at`.
- `read_tail(filename, levels: Option<Vec<String>>, limit: usize) -> Result<Vec<LogEntry>>` — resolve safe path, read whole file, parse each line as JSON (skip malformed), filter by level if provided, take last `limit`, return newest-first.
- `delete_file(filename) -> Result<()>` — resolve safe path, `tokio::fs::remove_file`.

### Path safety helper

```rust
fn resolve_log_path(filename: &str) -> Result<PathBuf>;
```

- Validates filename matches `^\d{4}-\d{2}-\d{2}\.log$` via regex (rejects `..`, `/`, etc. by construction)
- Joins with `logs/` base dir
- Canonicalizes both base dir and resolved path; asserts resolved path starts with canonical base
- Returns error keyed for `t!(i18n, "error.not_found")` if the file does not exist

Used by `read_tail` and `delete_file`. The constant `LOGS_DIR: &str = "logs"` lives at the top of the service module.

### DTOs

In `src/portals/admin/responses.rs`:

```rust
#[derive(Serialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct LogFileResponse {
    pub filename: String,
    pub size_bytes: u64,
    pub modified_at_epoch: u64, // unix epoch seconds — chosen over ISO string to avoid adding a chrono dep
}

#[derive(Serialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct LogEntryResponse {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub target: Option<String>,
    pub raw: serde_json::Value, // full original JSON for the modal
}
```

In `src/portals/admin/requests.rs`:

```rust
#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct LogQuery {
    pub levels: Option<String>, // comma-separated: "ERROR,WARN"
    pub limit: Option<usize>,   // default 500, capped at e.g. 5000
}
```

### Error messages

All user-facing strings via `t!(i18n, "key")`. Reuse `error.not_found` for missing files. Add new keys as needed in `locales/{en,zh}/messages.json`.

## Frontend

### Page (`frontend/admin/src/pages/LogsPage.tsx`)

**Layout** — toolbar row above an entries panel:

- `<Select>` file dropdown (newest first, label `2026-04-18.log (5 KB)`)
- `<CheckboxGroup>` level filter (`INFO`, `WARN`, `ERROR`, `DEBUG`, `TRACE`)
- `<Button variant="danger">` Delete (disabled while no file selected or while loading)

**Entries panel** — list of rows: `timestamp | level badge | target | message (truncated)`. Click a row → opens `LogEntryModal`. Empty state when zero entries match.

### State

```ts
const [files, setFiles] = useState<LogFileResponse[]>([]);
const [selected, setSelected] = useState<string | null>(null);
const [levels, setLevels] = useState<string[]>([]);
const [entries, setEntries] = useState<LogEntryResponse[]>([]);
const [loading, setLoading] = useState(false);
```

### Effects

- On mount: `GET /admin/logs` → `setFiles` → if non-empty, `setSelected(files[0].filename)`.
- When `selected` or `levels` changes (and `selected` is not null): `GET /admin/logs/{selected}?levels=...&limit=500` → `setEntries`.

### Modal (`frontend/admin/src/components/LogEntryModal.tsx`)

Props: `{ entry: LogEntryResponse }`. Renders `<ModalBody>` containing a `<pre>` (Tailwind utilities for monospace + scroll, no inline styles) with `JSON.stringify(entry.raw, null, 2)`. No footer needed.

Opened via:
```ts
modal.open(LogEntryModal, { entry }, { title: t("Log entry") });
```

### Delete flow

No generic confirm modal exists in the codebase yet, so create a small `frontend/admin/src/components/ConfirmDeleteLogModal.tsx`:

1. Click Delete → `modal.open(ConfirmDeleteLogModal, { filename, onConfirm })`.
2. On confirm: `DELETE /admin/logs/{filename}` → success toast → re-fetch file list → auto-select new newest (or clear if list empty).
3. Axios interceptors handle error toasts automatically.

### Sidebar (`frontend/admin/src/config/side-menu.ts`)

Add under existing `"other"` group:
```ts
{ key: "other.logs", label: "Logs", path: "/logs" }
```

### Router (`frontend/admin/src/router.tsx`)

Add: `{ path: "logs", element: <LogsPage /> }`

### Translations

Add the following keys to both `locales/en/messages.json` and `locales/zh/messages.json` (English values can be omitted where key == display text per the project's translation rules):

- `Logs` (page title; en omittable)
- `logs_subtitle` (parameterized-style descriptor)
- `Log file`, `Level`, `Delete log` (toolbar labels; en omittable)
- `No log entries match the current filter` (empty state)
- `Log entry` (modal title; en omittable)
- `confirm_delete_log` — `Delete {{filename}}? This cannot be undone.`
- `log_deleted` — `Log {{filename}} deleted.`

### Generated types

Run `make types` after backend DTOs land. Import `LogFileResponse`, `LogEntryResponse`, `LogQuery` from `@shared/types/generated` in the page.

## Data Flow

```
mount
  └─ GET /admin/logs
       └─ setFiles + auto-select files[0]
            └─ GET /admin/logs/{newest}?limit=500
                 └─ setEntries → render rows

row click
  └─ modal.open(LogEntryModal, { entry })

level toggle
  └─ GET /admin/logs/{selected}?levels=...&limit=500

delete click
  └─ modal.open(ConfirmDeleteLogModal)
       └─ DELETE /admin/logs/{selected}
            └─ toast → re-fetch file list → auto-select new newest
```

## Testing

- Backend service unit tests for `resolve_log_path` (rejects traversal attempts, accepts well-formed names) and `read_tail` (level filtering + tail-N correctness on a fixture file).
- Backend handler smoke tests via the existing test harness if one exists; otherwise manual via `make dev` + curl.
- Frontend manual verification in browser: file list loads, auto-select works, level filter updates entries, modal opens with pretty JSON, delete confirms and refreshes.
- Verification commands: `make check`, `make lint`, `make types` must all pass before completion.

## Risks / Notes

- **Whole-file read**: framework rotates daily; even a busy day's log is realistically a few hundred KB. If files ever grow into multi-MB territory, swap `read_tail` to a reverse byte-stream reader. Not premature here.
- **Concurrent writes**: while reading, the framework may still be appending. Reading the whole file then taking last N is safe — at worst we miss entries written during the read.
- **Path safety**: regex + canonicalize check is the boundary. Any future change must preserve both.
