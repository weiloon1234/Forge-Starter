use crate::domain::models::Admin;
use crate::domain::services::admin_service;
use crate::domain::services::log_service;
use crate::portals::admin::requests::LogQuery;
use crate::portals::admin::responses::{LogEntryResponse, LogFileResponse};
use axum::extract::{Path, Query};
use forge::prelude::*;

const DEFAULT_LIMIT: usize = 500;
const MAX_LIMIT: usize = 5000;

fn ensure_developer_log_access(actor: &Admin) -> Result<()> {
    if admin_service::can_access_observability(actor) {
        return Ok(());
    }

    Err(Error::not_found("Not found"))
}

pub async fn index(AuthenticatedModel(actor): Auth<Admin>) -> Result<impl IntoResponse> {
    ensure_developer_log_access(&actor)?;
    let files = log_service::list_files().await?;
    let body: Vec<LogFileResponse> = files.iter().map(LogFileResponse::from).collect();
    Ok(Json(body))
}

pub async fn show(
    AuthenticatedModel(actor): Auth<Admin>,
    Path(filename): Path<String>,
    Query(q): Query<LogQuery>,
) -> Result<impl IntoResponse> {
    ensure_developer_log_access(&actor)?;
    let levels = q.levels.as_deref().and_then(|s| {
        let v: Vec<String> = s
            .split(',')
            .map(|x| x.trim().to_string())
            .filter(|x| !x.is_empty())
            .collect();
        if v.is_empty() {
            None
        } else {
            Some(v)
        }
    });
    let limit = q
        .limit
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_LIMIT)
        .min(MAX_LIMIT);

    let entries = log_service::read_tail(&filename, levels, limit).await?;
    let body: Vec<LogEntryResponse> = entries.into_iter().map(LogEntryResponse::from).collect();
    Ok(Json(body))
}

pub async fn destroy(
    AuthenticatedModel(actor): Auth<Admin>,
    i18n: I18n,
    Path(filename): Path<String>,
) -> Result<impl IntoResponse> {
    ensure_developer_log_access(&actor)?;
    log_service::delete_file(&filename).await?;
    Ok(Json(MessageResponse::new(forge::t!(
        i18n,
        "log_deleted_message",
        filename = filename.as_str()
    ))))
}
