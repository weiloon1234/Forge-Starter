use serde::Serialize;
use ts_rs::TS;

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
    #[ts(type = "Record<string, unknown>")]
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
