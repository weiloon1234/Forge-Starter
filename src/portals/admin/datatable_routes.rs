use axum::extract::Path;
use axum::http::{HeaderMap, Uri};
use forge::prelude::*;
use percent_encoding::percent_decode_str;

use crate::ids::permissions::Permission;
use crate::portals::admin::datatables;

fn parse_request(uri: &Uri) -> DatatableRequest {
    let query_str = uri.query().unwrap_or("");
    let mut page: u64 = 1;
    let mut per_page: u64 = 20;
    let mut sort = Vec::new();
    let mut filters = Vec::new();
    let mut search = None;

    for pair in query_str.split('&') {
        let Some((key, raw)) = pair.split_once('=') else {
            continue;
        };
        let value = percent_decode_str(raw)
            .decode_utf8_lossy()
            .replace('+', " ");
        match key {
            "page" => {
                page = value.parse().unwrap_or(1);
            }
            "per_page" => {
                per_page = value.parse().unwrap_or(20);
            }
            "sort" => {
                sort = serde_json::from_str(&value).unwrap_or_default();
            }
            "filters" => {
                filters = serde_json::from_str(&value).unwrap_or_default();
            }
            "search" => {
                search = Some(value);
            }
            _ => {}
        }
    }

    DatatableRequest {
        page,
        per_page,
        sort,
        filters,
        search,
    }
}

fn resolve_timezone(app: &AppContext, headers: &HeaderMap) -> Timezone {
    headers
        .get("timezone")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| Timezone::parse(value).ok())
        .unwrap_or_else(|| app.timezone().unwrap_or_else(|_| Timezone::utc()))
}

fn minimum_read_permission(id: &str) -> Option<Permission> {
    match id {
        "admin.users" => Some(Permission::UsersRead),
        "admin.countries" => Some(Permission::CountriesRead),
        "admin.admins" => Some(Permission::AdminsRead),
        "admin.settings" => Some(Permission::SettingsRead),
        "admin.pages" => Some(Permission::PagesRead),
        "admin.credit_adjustments" => Some(Permission::CreditsRead),
        "admin.credit_transactions" => Some(Permission::CreditTransactionsRead),
        _ => None,
    }
}

fn required_permissions(
    id: &str,
    include_export: bool,
) -> Option<std::collections::BTreeSet<PermissionId>> {
    let read_permission = minimum_read_permission(id)?;

    let mut permissions = std::collections::BTreeSet::from([PermissionId::from(read_permission)]);
    if include_export {
        permissions.insert(PermissionId::from(Permission::ExportsRead));
    }

    Some(permissions)
}

async fn authorize_datatable(
    app: &AppContext,
    actor: &Actor,
    id: &str,
    include_export: bool,
) -> Result<()> {
    let Some(permissions) = required_permissions(id, include_export) else {
        return Ok(());
    };

    app.authorizer()?
        .authorize_permissions(actor, &permissions)
        .await
        .map_err(Error::from)
}

pub async fn query(
    State(app): State<AppContext>,
    i18n: I18n,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<String>,
    uri: Uri,
    headers: HeaderMap,
) -> Result<impl IntoResponse> {
    let request = parse_request(&uri);
    authorize_datatable(&app, &actor, &id, false).await?;
    let response = datatables::run_json(
        &id,
        &app,
        Some(&actor),
        request,
        Some(i18n.locale()),
        resolve_timezone(&app, &headers),
    )
    .await
    .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.not_found")))??;

    Ok(Json(response))
}

pub async fn download(
    State(app): State<AppContext>,
    i18n: I18n,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<String>,
    uri: Uri,
    headers: HeaderMap,
) -> Result<Response> {
    let request = parse_request(&uri);
    authorize_datatable(&app, &actor, &id, true).await?;
    datatables::run_download(
        &id,
        &app,
        Some(&actor),
        request,
        Some(i18n.locale()),
        resolve_timezone(&app, &headers),
    )
    .await
    .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.not_found")))?
}
