use axum::extract::Path;
use axum::http::Uri;
use forge::prelude::*;

fn parse_request(uri: &Uri) -> DatatableRequest {
    let query_str = uri.query().unwrap_or("");
    let mut page: u64 = 1;
    let mut per_page: u64 = 20;
    let mut sort = Vec::new();
    let mut filters = Vec::new();
    let mut search = None;

    for pair in query_str.split('&') {
        let Some((key, value)) = pair.split_once('=') else { continue };
        let value = percent_decode(value);
        match key {
            "page" => { page = value.parse().unwrap_or(1); }
            "per_page" => { per_page = value.parse().unwrap_or(20); }
            "sort" => { sort = serde_json::from_str(&value).unwrap_or_default(); }
            "filters" => { filters = serde_json::from_str(&value).unwrap_or_default(); }
            "search" => { search = Some(value); }
            _ => {}
        }
    }

    DatatableRequest { page, per_page, sort, filters, search }
}

fn percent_decode(s: &str) -> String {
    let mut result = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(
                std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""),
                16,
            ) {
                result.push(byte);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            result.push(b' ');
            i += 1;
            continue;
        }
        result.push(bytes[i]);
        i += 1;
    }
    String::from_utf8(result).unwrap_or_default()
}

pub async fn query(
    State(app): State<AppContext>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<String>,
    uri: Uri,
) -> Result<impl IntoResponse> {
    let request = parse_request(&uri);
    let registry = app.datatables()?;
    let dt = registry.get(&id)
        .ok_or_else(|| Error::not_found("datatable not found"))?;
    Ok(Json(dt.json(&app, Some(&actor), request).await?))
}

pub async fn download(
    State(app): State<AppContext>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<String>,
    uri: Uri,
) -> Result<Response> {
    let request = parse_request(&uri);
    let registry = app.datatables()?;
    let dt = registry.get(&id)
        .ok_or_else(|| Error::not_found("datatable not found"))?;
    dt.download(&app, Some(&actor), request).await
}
