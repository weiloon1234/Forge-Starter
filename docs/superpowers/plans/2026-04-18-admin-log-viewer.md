# Admin Log Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Git note:** The repository owner manages all git operations. Do NOT run `git commit`, `git push`, or `git merge`. The "Commit" steps in this plan describe the intended commit boundary — pause and let the owner commit, or skip the step if running in a sandbox.

**Goal:** Build an admin page that lists framework JSONL log files, shows the tail of a selected file with level filtering, lets the operator view a single entry as pretty JSON, and deletes a log file.

**Architecture:** Three new admin REST endpoints (`index`, `show`, `destroy`) backed by a portal-less `log_service` that reads from `logs/`. New React page `LogsPage.tsx` plus two small modals (`LogEntryModal`, `ConfirmDeleteLogModal`). All shared primitives only — no raw HTML form controls.

**Tech Stack:** Rust + Axum + Forge framework (backend), React + Vite + Tailwind + shared `@shared/components` and `@shared/modal` primitives (frontend), `ts_rs` for typed DTO bridging, JSON i18n shared between both sides.

---

## File Map

**Backend — create:**
- `src/portals/admin/log_routes.rs` — three thin handlers
- `src/domain/services/log_service.rs` — portal-less service (list / read tail / delete) + filename safety helper

**Backend — modify:**
- `src/portals/admin/mod.rs` — register `log_routes` module + 3 routes
- `src/portals/admin/requests.rs` — add `LogQuery`
- `src/portals/admin/responses.rs` — add `LogFileResponse`, `LogEntryResponse`
- `src/domain/services/mod.rs` — `pub mod log_service;`

**Frontend — create:**
- `frontend/admin/src/pages/LogsPage.tsx`
- `frontend/admin/src/components/LogEntryModal.tsx`
- `frontend/admin/src/components/ConfirmDeleteLogModal.tsx`

**Frontend — modify:**
- `frontend/admin/src/router.tsx` — add `/logs` route
- `frontend/admin/src/config/side-menu.ts` — add Logs entry under "Other"
- `locales/en/messages.json` — add new keys
- `locales/zh/messages.json` — add new keys

---

## Task 1: Backend — log service skeleton + filename safety

**Files:**
- Create: `src/domain/services/log_service.rs`
- Modify: `src/domain/services/mod.rs`

- [ ] **Step 1: Register the new module**

Edit `src/domain/services/mod.rs`:

```rust
pub mod auth_service;
pub mod log_service;
```

- [ ] **Step 2: Create the service file with safety helper**

Create `src/domain/services/log_service.rs`:

```rust
use forge::prelude::*;
use std::path::{Path, PathBuf};

pub const LOGS_DIR: &str = "logs";

/// Validate that `filename` matches `YYYY-MM-DD.log` exactly, then resolve
/// against `LOGS_DIR` and verify the canonical path is still inside it.
pub fn resolve_log_path(filename: &str) -> Result<PathBuf> {
    if !is_valid_log_filename(filename) {
        return Err(Error::not_found("log file not found"));
    }

    let base = Path::new(LOGS_DIR);
    let candidate = base.join(filename);

    let canonical_base = base
        .canonicalize()
        .map_err(|_| Error::not_found("log file not found"))?;
    let canonical_candidate = candidate
        .canonicalize()
        .map_err(|_| Error::not_found("log file not found"))?;

    if !canonical_candidate.starts_with(&canonical_base) {
        return Err(Error::not_found("log file not found"));
    }

    Ok(canonical_candidate)
}

fn is_valid_log_filename(name: &str) -> bool {
    // Pattern: YYYY-MM-DD.log  (4-2-2 digits, dashes, ".log" suffix)
    let bytes = name.as_bytes();
    if bytes.len() != 14 {
        return false;
    }
    let digit = |i: usize| bytes[i].is_ascii_digit();
    digit(0) && digit(1) && digit(2) && digit(3)
        && bytes[4] == b'-'
        && digit(5) && digit(6)
        && bytes[7] == b'-'
        && digit(8) && digit(9)
        && &bytes[10..] == b".log"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_well_formed_filename() {
        assert!(is_valid_log_filename("2026-04-18.log"));
    }

    #[test]
    fn rejects_traversal_attempts() {
        assert!(!is_valid_log_filename("../etc/passwd"));
        assert!(!is_valid_log_filename("../2026-04-18.log"));
        assert!(!is_valid_log_filename("2026-04-18.log/extra"));
        assert!(!is_valid_log_filename("2026-04-18"));
        assert!(!is_valid_log_filename(".log"));
        assert!(!is_valid_log_filename(""));
        assert!(!is_valid_log_filename("9999-99-99.log.exe"));
    }

    #[test]
    fn rejects_wrong_shape() {
        assert!(!is_valid_log_filename("2026-4-18.log"));
        assert!(!is_valid_log_filename("2026_04_18.log"));
        assert!(!is_valid_log_filename("2026-04-18.txt"));
    }
}
```

- [ ] **Step 3: Run tests to verify**

Run: `cargo test --lib log_service`
Expected: all 3 tests PASS.

- [ ] **Step 4: Run check**

Run: `make check`
Expected: PASS.

- [ ] **Step 5: Commit**

Suggested message: `feat(logs): add log_service skeleton with filename safety helper`
Files: `src/domain/services/mod.rs`, `src/domain/services/log_service.rs`

---

## Task 2: Backend — list_files

**Files:**
- Modify: `src/domain/services/log_service.rs`

- [ ] **Step 1: Add a failing test**

Append to `#[cfg(test)] mod tests` in `src/domain/services/log_service.rs`:

```rust
#[tokio::test]
async fn list_files_returns_only_log_files_newest_first() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("2026-04-15.log"), b"a").unwrap();
    std::fs::write(dir.path().join("2026-04-18.log"), b"abc").unwrap();
    std::fs::write(dir.path().join("README.md"), b"ignore").unwrap();

    let files = list_files_in(dir.path()).await.unwrap();

    assert_eq!(files.len(), 2);
    assert_eq!(files[0].filename, "2026-04-18.log");
    assert_eq!(files[1].filename, "2026-04-15.log");
    assert_eq!(files[0].size_bytes, 3);
}
```

If `tempfile` is not in `[dev-dependencies]`, add it to `Cargo.toml`:

```toml
[dev-dependencies]
tempfile = "3"
```

(Pause and confirm with the owner before adding the dep — they require this.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cargo test --lib log_service::tests::list_files`
Expected: FAIL — `list_files_in` not defined.

- [ ] **Step 3: Implement**

Add to `src/domain/services/log_service.rs`:

```rust
use serde::Serialize;
use std::time::UNIX_EPOCH;

#[derive(Debug, Clone, Serialize)]
pub struct LogFileInfo {
    pub filename: String,
    pub size_bytes: u64,
    pub modified_at_epoch: u64,
}

pub async fn list_files() -> Result<Vec<LogFileInfo>> {
    list_files_in(Path::new(LOGS_DIR)).await
}

pub(crate) async fn list_files_in(dir: &Path) -> Result<Vec<LogFileInfo>> {
    let mut out = Vec::new();
    let mut entries = match tokio::fs::read_dir(dir).await {
        Ok(r) => r,
        Err(_) => return Ok(out), // empty dir or missing → empty list
    };

    while let Some(entry) = entries.next_entry().await.map_err(Error::from)? {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_valid_log_filename(&name) {
            continue;
        }
        let meta = entry.metadata().await.map_err(Error::from)?;
        let modified_at_epoch = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        out.push(LogFileInfo {
            filename: name,
            size_bytes: meta.len(),
            modified_at_epoch,
        });
    }

    // Newest first — filenames are lexicographically date-sortable.
    out.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(out)
}
```

- [ ] **Step 4: Run test**

Run: `cargo test --lib log_service::tests::list_files`
Expected: PASS.

- [ ] **Step 5: Run check**

Run: `make check`
Expected: PASS.

- [ ] **Step 6: Commit**

Suggested message: `feat(logs): list_files service`

---

## Task 3: Backend — read_tail with level filter

**Files:**
- Modify: `src/domain/services/log_service.rs`

- [ ] **Step 1: Add failing tests**

Append to the test module:

```rust
#[tokio::test]
async fn read_tail_returns_last_n_newest_first() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("2026-04-18.log");
    let lines = (1..=10)
        .map(|i| format!(r#"{{"timestamp":"t{i}","level":"INFO","message":"m{i}","target":"x"}}"#))
        .collect::<Vec<_>>()
        .join("\n");
    std::fs::write(&path, lines).unwrap();

    let entries = read_tail_from(&path, None, 3).await.unwrap();

    assert_eq!(entries.len(), 3);
    assert_eq!(entries[0].message, "m10");
    assert_eq!(entries[2].message, "m8");
}

#[tokio::test]
async fn read_tail_filters_by_level() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("2026-04-18.log");
    let lines = [
        r#"{"timestamp":"t1","level":"INFO","message":"a","target":"x"}"#,
        r#"{"timestamp":"t2","level":"ERROR","message":"b","target":"x"}"#,
        r#"{"timestamp":"t3","level":"INFO","message":"c","target":"x"}"#,
        r#"{"timestamp":"t4","level":"ERROR","message":"d","target":"x"}"#,
    ].join("\n");
    std::fs::write(&path, lines).unwrap();

    let entries = read_tail_from(&path, Some(vec!["ERROR".into()]), 10).await.unwrap();

    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].message, "d");
    assert_eq!(entries[1].message, "b");
}

#[tokio::test]
async fn read_tail_skips_malformed_lines() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("2026-04-18.log");
    let lines = [
        r#"{"timestamp":"t1","level":"INFO","message":"ok","target":"x"}"#,
        "this is not json",
        r#"{"timestamp":"t2","level":"INFO","message":"ok2","target":"x"}"#,
    ].join("\n");
    std::fs::write(&path, lines).unwrap();

    let entries = read_tail_from(&path, None, 10).await.unwrap();

    assert_eq!(entries.len(), 2);
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cargo test --lib log_service::tests::read_tail`
Expected: FAIL — `read_tail_from` and `LogEntry` not defined.

- [ ] **Step 3: Implement**

Append to `src/domain/services/log_service.rs`:

```rust
#[derive(Debug, Clone, Serialize)]
pub struct LogEntry {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub target: Option<String>,
    pub raw: serde_json::Value,
}

pub async fn read_tail(
    filename: &str,
    levels: Option<Vec<String>>,
    limit: usize,
) -> Result<Vec<LogEntry>> {
    let path = resolve_log_path(filename)?;
    read_tail_from(&path, levels, limit).await
}

pub(crate) async fn read_tail_from(
    path: &Path,
    levels: Option<Vec<String>>,
    limit: usize,
) -> Result<Vec<LogEntry>> {
    let bytes = tokio::fs::read(path).await.map_err(Error::from)?;
    let text = String::from_utf8_lossy(&bytes);

    let level_set: Option<std::collections::HashSet<String>> =
        levels.map(|v| v.into_iter().map(|s| s.to_uppercase()).collect());

    let mut parsed: Vec<LogEntry> = Vec::new();
    for line in text.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(value) = serde_json::from_str::<serde_json::Value>(line) else {
            continue;
        };
        let level = value
            .get("level")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        if let Some(set) = &level_set {
            if !set.contains(&level.to_uppercase()) {
                continue;
            }
        }

        let entry = LogEntry {
            timestamp: value
                .get("timestamp")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            level,
            message: value
                .get("message")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string(),
            target: value
                .get("target")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            raw: value,
        };
        parsed.push(entry);
    }

    let take_from = parsed.len().saturating_sub(limit);
    let mut tail = parsed.split_off(take_from);
    tail.reverse(); // newest first
    Ok(tail)
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test --lib log_service::tests::read_tail`
Expected: 3 PASS.

- [ ] **Step 5: Run check**

Run: `make check`
Expected: PASS.

- [ ] **Step 6: Commit**

Suggested message: `feat(logs): read_tail service with level filter`

---

## Task 4: Backend — delete_file

**Files:**
- Modify: `src/domain/services/log_service.rs`

- [ ] **Step 1: Add failing test**

Append to test module:

```rust
#[tokio::test]
async fn delete_file_removes_existing_file() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("2026-04-18.log");
    std::fs::write(&path, b"x").unwrap();
    assert!(path.exists());

    delete_file_at(&path).await.unwrap();

    assert!(!path.exists());
}
```

- [ ] **Step 2: Run test (FAIL)**

Run: `cargo test --lib log_service::tests::delete_file`
Expected: FAIL — `delete_file_at` not defined.

- [ ] **Step 3: Implement**

Append:

```rust
pub async fn delete_file(filename: &str) -> Result<()> {
    let path = resolve_log_path(filename)?;
    delete_file_at(&path).await
}

pub(crate) async fn delete_file_at(path: &Path) -> Result<()> {
    tokio::fs::remove_file(path).await.map_err(Error::from)?;
    Ok(())
}
```

- [ ] **Step 4: Run test**

Run: `cargo test --lib log_service::tests::delete_file`
Expected: PASS.

- [ ] **Step 5: Commit**

Suggested message: `feat(logs): delete_file service`

---

## Task 5: Backend — DTOs

**Files:**
- Modify: `src/portals/admin/responses.rs`
- Modify: `src/portals/admin/requests.rs`

- [ ] **Step 1: Add response DTOs**

Append to `src/portals/admin/responses.rs`:

```rust
use crate::domain::services::log_service::{LogEntry, LogFileInfo};

#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct LogFileResponse {
    pub filename: String,
    pub size_bytes: u64,
    pub modified_at_epoch: u64,
}

impl From<&LogFileInfo> for LogFileResponse {
    fn from(f: &LogFileInfo) -> Self {
        Self {
            filename: f.filename.clone(),
            size_bytes: f.size_bytes,
            modified_at_epoch: f.modified_at_epoch,
        }
    }
}

#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct LogEntryResponse {
    pub timestamp: String,
    pub level: String,
    pub message: String,
    pub target: Option<String>,
    pub raw: serde_json::Value,
}

impl From<LogEntry> for LogEntryResponse {
    fn from(e: LogEntry) -> Self {
        Self {
            timestamp: e.timestamp,
            level: e.level,
            message: e.message,
            target: e.target,
            raw: e.raw,
        }
    }
}
```

- [ ] **Step 2: Add request DTO**

Append to `src/portals/admin/requests.rs`:

```rust
#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct LogQuery {
    /// Comma-separated list of levels (e.g. `ERROR,WARN`). Empty/None = no filter.
    pub levels: Option<String>,
    /// Default 500, capped at 5000 by the handler.
    pub limit: Option<usize>,
}
```

- [ ] **Step 3: Run check**

Run: `make check`
Expected: PASS.

- [ ] **Step 4: Run types**

Run: `make types`
Expected: PASS, generates `LogFileResponse.ts`, `LogEntryResponse.ts`, `LogQuery.ts` under `frontend/shared/types/generated/`.

- [ ] **Step 5: Commit**

Suggested message: `feat(logs): add admin DTOs for log viewer`

---

## Task 6: Backend — handlers + route registration

**Files:**
- Create: `src/portals/admin/log_routes.rs`
- Modify: `src/portals/admin/mod.rs`

- [ ] **Step 1: Create the handler file**

Create `src/portals/admin/log_routes.rs`:

```rust
use crate::domain::services::log_service;
use crate::portals::admin::requests::LogQuery;
use crate::portals::admin::responses::{LogEntryResponse, LogFileResponse};
use axum::extract::{Path, Query};
use forge::prelude::*;

const DEFAULT_LIMIT: usize = 500;
const MAX_LIMIT: usize = 5000;

pub async fn index(State(_app): State<AppContext>) -> Result<impl IntoResponse> {
    let files = log_service::list_files().await?;
    let body: Vec<LogFileResponse> = files.iter().map(LogFileResponse::from).collect();
    Ok(Json(body))
}

pub async fn show(
    State(_app): State<AppContext>,
    Path(filename): Path<String>,
    Query(q): Query<LogQuery>,
) -> Result<impl IntoResponse> {
    let levels = q.levels.as_deref().and_then(|s| {
        let v: Vec<String> = s
            .split(',')
            .map(|x| x.trim().to_string())
            .filter(|x| !x.is_empty())
            .collect();
        if v.is_empty() { None } else { Some(v) }
    });
    let limit = q.limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT);

    let entries = log_service::read_tail(&filename, levels, limit).await?;
    let body: Vec<LogEntryResponse> = entries.into_iter().map(LogEntryResponse::from).collect();
    Ok(Json(body))
}

pub async fn destroy(
    State(_app): State<AppContext>,
    i18n: I18n,
    Path(filename): Path<String>,
) -> Result<impl IntoResponse> {
    log_service::delete_file(&filename).await?;
    Ok(Json(MessageResponse::new(forge::t!(i18n, "log_deleted_message"))))
}
```

- [ ] **Step 2: Register the module + routes**

Edit `src/portals/admin/mod.rs`:

Add to the `pub mod` section:
```rust
pub mod log_routes;
```

Inside the `r.group("/admin", |r| { ... })` block, after the Countries section and before Datatables, add:

```rust
            // ── Logs ────────────────────────────────────
            r.route_named_with_options(
                "admin.logs.index",
                "/logs",
                get(log_routes::index),
                HttpRouteOptions::new().guard(Guard::Admin).document(
                    RouteDoc::new()
                        .get()
                        .summary("List log files")
                        .tag("admin:logs")
                        .response::<Vec<crate::portals::admin::responses::LogFileResponse>>(200),
                ),
            );
            r.route_named_with_options(
                "admin.logs.show",
                "/logs/{filename}",
                get(log_routes::show),
                HttpRouteOptions::new().guard(Guard::Admin).document(
                    RouteDoc::new()
                        .get()
                        .summary("Read tail of a log file")
                        .tag("admin:logs")
                        .response::<Vec<crate::portals::admin::responses::LogEntryResponse>>(200),
                ),
            );
            r.route_named_with_options(
                "admin.logs.destroy",
                "/logs/{filename}",
                axum::routing::delete(log_routes::destroy),
                HttpRouteOptions::new().guard(Guard::Admin).document(
                    RouteDoc::new()
                        .delete()
                        .summary("Delete a log file")
                        .tag("admin:logs")
                        .response::<MessageResponse>(200),
                ),
            );
```

(If `delete` is already exported from `forge::prelude::*`, drop the `axum::routing::` prefix.)

- [ ] **Step 3: Add the translation key**

Edit `locales/en/messages.json` — add (next to other parameterized keys):
```json
"log_deleted_message": "Log file {{filename}} deleted."
```
*(English need not be translated when key == value, but parameterized strings always go in en.)*

Edit `locales/zh/messages.json` — add the corresponding key:
```json
"log_deleted_message": "日志文件 {{filename}} 已删除。"
```

NOTE: `destroy` currently passes no params to `t!()`. Either change the handler to pass `filename` as a param or simplify the key to a non-parameterized string. Pick one:

Option A (recommended) — make it parameterized. Change `destroy` to:
```rust
Ok(Json(MessageResponse::new(forge::t!(i18n, "log_deleted_message", filename = filename.as_str()))))
```

Option B — simpler key without param: `"log_deleted_message": "Log file deleted."` and leave the handler call as-is.

Use Option A.

- [ ] **Step 4: Run check + lint**

Run: `make check && make lint`
Expected: PASS.

- [ ] **Step 5: Smoke test manually**

In one shell: `make dev:api`. In another:
```bash
# Need an admin token first — login via the existing flow, then:
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/admin/logs
curl -H "Authorization: Bearer $TOKEN" "http://localhost:3000/admin/logs/2026-04-18.log?limit=5"
```
Expected: JSON list of files / JSON list of entries.

- [ ] **Step 6: Commit**

Suggested message: `feat(logs): admin routes for list/read/delete`

---

## Task 7: Frontend — translations

**Files:**
- Modify: `locales/en/messages.json`
- Modify: `locales/zh/messages.json`

- [ ] **Step 1: Add English keys**

Append to `locales/en/messages.json` (alongside other parameterized keys; omit any where en value equals the key):

```json
"logs_subtitle": "View and manage application log files.",
"No log entries match the current filter": "No log entries match the current filter.",
"Log entry": "Log entry",
"confirm_delete_log": "Delete {{filename}}? This cannot be undone."
```

(`Logs`, `Log file`, `Level`, `Delete log`, `Delete`, `Cancel` may already exist or are key-equals-value; only add if missing.)

- [ ] **Step 2: Add Chinese keys**

Append to `locales/zh/messages.json`:

```json
"Logs": "日志",
"logs_subtitle": "查看和管理应用程序日志文件。",
"Log file": "日志文件",
"Level": "级别",
"Delete log": "删除日志",
"No log entries match the current filter": "没有日志条目符合当前筛选条件。",
"Log entry": "日志条目",
"confirm_delete_log": "删除 {{filename}}？此操作无法撤销。",
"log_deleted_message": "日志文件 {{filename}} 已删除。"
```

(Skip any that already exist.)

- [ ] **Step 3: Verify counts**

Run: `wc -l locales/en/messages.json locales/zh/messages.json`
Expected: zh count >= en count (zh must contain every key en uses, including key-equals-value keys).

- [ ] **Step 4: Commit**

Suggested message: `feat(logs): translations for log viewer page`

---

## Task 8: Frontend — LogEntryModal component

**Files:**
- Create: `frontend/admin/src/components/LogEntryModal.tsx`

- [ ] **Step 1: Create the modal**

```tsx
import { ModalBody } from "@shared/modal";
import type { LogEntryResponse } from "@shared/types/generated";

interface LogEntryModalProps {
  entry: LogEntryResponse;
  onClose: () => void;
}

export function LogEntryModal({ entry }: LogEntryModalProps) {
  return (
    <ModalBody>
      <pre className="overflow-auto rounded-md bg-[var(--color-surface-alt,#0b1020)] p-4 text-xs font-mono leading-relaxed text-[var(--color-text-on-surface-alt,#e2e8f0)]">
        {JSON.stringify(entry.raw, null, 2)}
      </pre>
    </ModalBody>
  );
}
```

(If the admin portal already defines a code-block class like `sf-code-block` in `styles/forms.css` or `app.css`, prefer that and drop the inline-ish utility chain. Quick check: `grep -r "sf-code" frontend/admin/src/styles`.)

- [ ] **Step 2: Run lint**

Run: `make lint`
Expected: PASS.

- [ ] **Step 3: Commit**

Suggested message: `feat(logs): LogEntryModal component`

---

## Task 9: Frontend — ConfirmDeleteLogModal component

**Files:**
- Create: `frontend/admin/src/components/ConfirmDeleteLogModal.tsx`

- [ ] **Step 1: Create the modal**

```tsx
import { Button } from "@shared/components";
import { ModalBody, ModalFooter } from "@shared/modal";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface ConfirmDeleteLogModalProps {
  filename: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDeleteLogModal({
  filename,
  onConfirm,
  onClose,
}: ConfirmDeleteLogModalProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ModalBody>
        <p>{t("confirm_delete_log", { filename })}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          {t("Cancel")}
        </Button>
        <Button variant="danger" size="sm" busy={busy} onClick={handleConfirm}>
          {t("Delete")}
        </Button>
      </ModalFooter>
    </>
  );
}
```

- [ ] **Step 2: Run lint**

Run: `make lint`
Expected: PASS.

- [ ] **Step 3: Commit**

Suggested message: `feat(logs): ConfirmDeleteLogModal component`

---

## Task 10: Frontend — LogsPage

**Files:**
- Create: `frontend/admin/src/pages/LogsPage.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { Button, CheckboxGroup, Select } from "@shared/components";
import { modal } from "@shared/modal";
import type {
  LogEntryResponse,
  LogFileResponse,
} from "@shared/types/generated";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/api";
import { ConfirmDeleteLogModal } from "@/components/ConfirmDeleteLogModal";
import { LogEntryModal } from "@/components/LogEntryModal";

const LEVELS = ["TRACE", "DEBUG", "INFO", "WARN", "ERROR"];
const TAIL_LIMIT = 500;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function LogsPage() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<LogFileResponse[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [levels, setLevels] = useState<string[]>([]);
  const [entries, setEntries] = useState<LogEntryResponse[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFiles = useCallback(async () => {
    const { data } = await api.get<LogFileResponse[]>("/logs");
    setFiles(data);
    setSelected((current) => {
      if (current && data.some((f) => f.filename === current)) return current;
      return data[0]?.filename ?? null;
    });
  }, []);

  const fetchEntries = useCallback(
    async (filename: string, levelFilter: string[]) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: String(TAIL_LIMIT) });
        if (levelFilter.length > 0) params.set("levels", levelFilter.join(","));
        const { data } = await api.get<LogEntryResponse[]>(
          `/logs/${encodeURIComponent(filename)}?${params.toString()}`,
        );
        setEntries(data);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchFiles();
  }, [fetchFiles]);

  useEffect(() => {
    if (!selected) {
      setEntries([]);
      return;
    }
    void fetchEntries(selected, levels);
  }, [selected, levels, fetchEntries]);

  const fileOptions = useMemo(
    () =>
      files.map((f) => ({
        value: f.filename,
        label: `${f.filename} (${formatSize(f.size_bytes)})`,
      })),
    [files],
  );

  const levelOptions = useMemo(
    () => LEVELS.map((l) => ({ value: l, label: l })),
    [],
  );

  const openEntry = (entry: LogEntryResponse) => {
    modal.open(LogEntryModal, { entry }, { title: t("Log entry") });
  };

  const handleDelete = () => {
    if (!selected) return;
    const filename = selected;
    modal.open(
      ConfirmDeleteLogModal,
      {
        filename,
        onConfirm: async () => {
          const { data } = await api.delete<{ message: string }>(
            `/logs/${encodeURIComponent(filename)}`,
          );
          toast.success(data.message);
          await fetchFiles();
        },
      },
      { title: t("Delete log") },
    );
  };

  return (
    <div>
      <h1 className="sf-page-title">{t("Logs")}</h1>
      <p className="sf-page-subtitle">{t("logs_subtitle")}</p>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <Select
            name="log_file"
            label={t("Log file")}
            value={selected ?? ""}
            options={fileOptions}
            onChange={(value) => {
              if (typeof value === "string") setSelected(value || null);
            }}
          />
        </div>
        <div className="min-w-[320px]">
          <CheckboxGroup
            name="levels"
            label={t("Level")}
            value={levels}
            options={levelOptions}
            onChange={(value) => setLevels(value)}
          />
        </div>
        <div>
          <Button
            variant="danger"
            size="sm"
            disabled={!selected || loading}
            onClick={handleDelete}
          >
            {t("Delete log")}
          </Button>
        </div>
      </div>

      <div className="mt-6 sf-card">
        {entries.length === 0 ? (
          <p className="sf-empty">{t("No log entries match the current filter")}</p>
        ) : (
          <ul className="divide-y divide-[var(--color-border,rgba(0,0,0,0.08))]">
            {entries.map((entry, idx) => (
              <li key={`${entry.timestamp}-${idx}`}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-[var(--color-surface-hover,rgba(0,0,0,0.03))]"
                  onClick={() => openEntry(entry)}
                >
                  <div className="flex items-center gap-3 text-xs">
                    <span className="font-mono text-[var(--color-text-muted)]">
                      {entry.timestamp}
                    </span>
                    <span className={`sf-status-badge sf-status-badge--${entry.level.toLowerCase()}`}>
                      {entry.level}
                    </span>
                    {entry.target && (
                      <span className="font-mono text-[var(--color-text-muted)]">
                        {entry.target}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 truncate">{entry.message}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

NOTE on the row buttons: per `frontend/CLAUDE.md` rule 1, raw `<button>` is not allowed in feature code — use `<Button unstyled>`. Replace each `<button>` with:

```tsx
<Button
  type="button"
  unstyled
  className="w-full text-left px-3 py-2 hover:bg-[var(--color-surface-hover,rgba(0,0,0,0.03))]"
  onClick={() => openEntry(entry)}
>
  ...
</Button>
```

- [ ] **Step 2: Run lint + check**

Run: `make lint && make check`
Expected: PASS.

- [ ] **Step 3: Commit**

Suggested message: `feat(logs): LogsPage with file picker, level filter, delete`

---

## Task 11: Frontend — wire route + sidebar

**Files:**
- Modify: `frontend/admin/src/router.tsx`
- Modify: `frontend/admin/src/config/side-menu.ts`

- [ ] **Step 1: Add the route**

Edit `frontend/admin/src/router.tsx`:

```tsx
import { createBrowserRouter } from "react-router-dom";
import { AdminLayout } from "@/layouts/AdminLayout";
import { CountryPage } from "@/pages/CountryPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { ErrorPage } from "@/pages/ErrorPage";
import { LogsPage } from "@/pages/LogsPage";
import { NotFoundPage } from "@/pages/NotFoundPage";

export const router = createBrowserRouter(
  [
    {
      element: <AdminLayout />,
      errorElement: <ErrorPage />,
      children: [
        { index: true, element: <DashboardPage /> },
        { path: "countries", element: <CountryPage /> },
        { path: "logs", element: <LogsPage /> },
        { path: "*", element: <NotFoundPage /> },
      ],
    },
  ],
  { basename: "/admin" },
);
```

- [ ] **Step 2: Add the sidebar entry**

Edit `frontend/admin/src/config/side-menu.ts`:

```ts
import type { LucideIcon } from "lucide-react";
import {
  FileText,
  LayoutDashboard,
  MoreHorizontal,
  Settings,
  Users,
} from "lucide-react";

export type MenuItem = {
  key: string;
  label: string;
  icon?: LucideIcon;
  path?: string;
  permission?: string;
  notification?: string;
  children?: MenuItem[];
};

export const sideMenu: MenuItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    path: "/",
  },
  {
    key: "users",
    label: "Users",
    icon: Users,
    children: [
      {
        key: "users.list",
        label: "All Users",
        path: "/users",
        permission: "users.view",
      },
      {
        key: "users.admins",
        label: "Admins",
        path: "/users/admins",
        permission: "admins.view",
      },
    ],
  },
  {
    key: "other",
    label: "Other",
    icon: MoreHorizontal,
    children: [
      {
        key: "other.countries",
        label: "Countries",
        path: "/countries",
      },
      {
        key: "other.logs",
        label: "Logs",
        path: "/logs",
        icon: FileText,
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    path: "/settings",
    permission: "settings.view",
  },
];
```

- [ ] **Step 3: Run lint + check**

Run: `make lint && make check`
Expected: PASS.

- [ ] **Step 4: Commit**

Suggested message: `feat(logs): wire route + sidebar entry`

---

## Task 12: End-to-end manual verification

- [ ] **Step 1: Start the full stack**

Run: `make dev`

- [ ] **Step 2: Verify in browser**

Open `http://localhost:5173/admin`, log in, click sidebar **Other → Logs**.

Verify:
- File dropdown lists today's and historical logs newest-first with size suffix
- Newest file is auto-selected, entries appear without further interaction
- Toggling level checkboxes refilters (server round-trip; verify Network tab)
- Clicking a row opens the modal showing pretty-printed JSON
- Clicking **Delete log** opens the confirm modal with the filename interpolated; confirming deletes the file, shows a success toast, refreshes the file list, and auto-selects the next-newest

Verify Chinese works:
- Switch locale via account menu / locale toggle to `zh`
- Re-load page; all labels render in Chinese

- [ ] **Step 3: Verification commands**

Run: `make check && make lint && make types`
Expected: all PASS.

- [ ] **Step 4: Final commit (if any pending fixes)**

If verification surfaced fixes, commit them as a final cleanup. Otherwise no commit needed.

---

## Self-Review Notes

**Spec coverage:**
- List files → Tasks 2, 6, 10 ✅
- Read tail with level filter → Tasks 3, 6, 10 ✅
- Delete with confirm → Tasks 4, 6, 9, 10 ✅
- Pretty JSON modal → Task 8 ✅
- Auto-select newest on mount → Task 10 (effect on mount + first useEffect) ✅
- Path safety → Task 1 ✅
- Translations (en + zh) → Task 7 ✅
- Sidebar + route → Task 11 ✅
- Permission gating → none required (Guard::Admin only, per spec) ✅

**Naming consistency:** `read_tail` / `read_tail_from`, `delete_file` / `delete_file_at`, `list_files` / `list_files_in` — public/private split is consistent across the service.

**DTO field names:** `filename`, `size_bytes`, `modified_at_epoch`, `levels`, `limit`, `raw` — same names appear in backend handler, response DTOs, and frontend `LogsPage` consumer code.

**Translation note:** `log_deleted_message` is parameterized with `filename`; matched in handler (`Option A` in Task 6) and en/zh JSON.
