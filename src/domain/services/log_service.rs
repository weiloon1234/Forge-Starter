use forge::prelude::*;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

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
        Err(_) => return Ok(out),
    };

    while let Some(entry) = entries.next_entry().await.map_err(Error::other)? {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !is_valid_log_filename(&name) {
            continue;
        }
        let meta = entry.metadata().await.map_err(Error::other)?;
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

    out.sort_by(|a, b| b.filename.cmp(&a.filename));
    Ok(out)
}

fn is_valid_log_filename(name: &str) -> bool {
    let bytes = name.as_bytes();
    if bytes.len() != 14 {
        return false;
    }
    let digit = |i: usize| bytes[i].is_ascii_digit();
    digit(0)
        && digit(1)
        && digit(2)
        && digit(3)
        && bytes[4] == b'-'
        && digit(5)
        && digit(6)
        && bytes[7] == b'-'
        && digit(8)
        && digit(9)
        && &bytes[10..] == b".log"
}

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
    let bytes = tokio::fs::read(path).await.map_err(Error::other)?;
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

pub async fn delete_file(filename: &str) -> Result<()> {
    let path = resolve_log_path(filename)?;
    delete_file_at(&path).await
}

pub(crate) async fn delete_file_at(path: &Path) -> Result<()> {
    tokio::fs::remove_file(path).await.map_err(Error::other)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp_dir(label: &str) -> std::path::PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir =
            std::env::temp_dir().join(format!("forge_logs_{label}_{nanos}_{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[tokio::test]
    async fn list_files_returns_only_log_files_newest_first() {
        let dir = unique_temp_dir("list_files");
        std::fs::write(dir.join("2026-04-15.log"), b"a").unwrap();
        std::fs::write(dir.join("2026-04-18.log"), b"abc").unwrap();
        std::fs::write(dir.join("README.md"), b"ignore").unwrap();

        let files = list_files_in(&dir).await.unwrap();

        assert_eq!(files.len(), 2);
        assert_eq!(files[0].filename, "2026-04-18.log");
        assert_eq!(files[1].filename, "2026-04-15.log");
        assert_eq!(files[0].size_bytes, 3);

        let _ = std::fs::remove_dir_all(&dir);
    }

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

    #[tokio::test]
    async fn read_tail_returns_last_n_newest_first() {
        let dir = unique_temp_dir("read_tail_basic");
        let path = dir.join("2026-04-18.log");
        let lines = (1..=10)
            .map(|i| {
                format!(r#"{{"timestamp":"t{i}","level":"INFO","message":"m{i}","target":"x"}}"#)
            })
            .collect::<Vec<_>>()
            .join("\n");
        std::fs::write(&path, lines).unwrap();

        let entries = read_tail_from(&path, None, 3).await.unwrap();

        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].message, "m10");
        assert_eq!(entries[2].message, "m8");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn read_tail_filters_by_level() {
        let dir = unique_temp_dir("read_tail_filter");
        let path = dir.join("2026-04-18.log");
        let lines = [
            r#"{"timestamp":"t1","level":"INFO","message":"a","target":"x"}"#,
            r#"{"timestamp":"t2","level":"ERROR","message":"b","target":"x"}"#,
            r#"{"timestamp":"t3","level":"INFO","message":"c","target":"x"}"#,
            r#"{"timestamp":"t4","level":"ERROR","message":"d","target":"x"}"#,
        ]
        .join("\n");
        std::fs::write(&path, lines).unwrap();

        let entries = read_tail_from(&path, Some(vec!["ERROR".into()]), 10)
            .await
            .unwrap();

        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].message, "d");
        assert_eq!(entries[1].message, "b");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn read_tail_skips_malformed_lines() {
        let dir = unique_temp_dir("read_tail_malformed");
        let path = dir.join("2026-04-18.log");
        let lines = [
            r#"{"timestamp":"t1","level":"INFO","message":"ok","target":"x"}"#,
            "this is not json",
            r#"{"timestamp":"t2","level":"INFO","message":"ok2","target":"x"}"#,
        ]
        .join("\n");
        std::fs::write(&path, lines).unwrap();

        let entries = read_tail_from(&path, None, 10).await.unwrap();

        assert_eq!(entries.len(), 2);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[tokio::test]
    async fn delete_file_removes_existing_file() {
        let dir = unique_temp_dir("delete_file");
        let path = dir.join("2026-04-18.log");
        std::fs::write(&path, b"x").unwrap();
        assert!(path.exists());

        delete_file_at(&path).await.unwrap();

        assert!(!path.exists());
        let _ = std::fs::remove_dir_all(&dir);
    }
}
