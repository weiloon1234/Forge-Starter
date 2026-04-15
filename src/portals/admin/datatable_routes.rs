use axum::extract::{Path, Query};
use forge::prelude::*;

pub async fn query(
    State(app): State<AppContext>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<String>,
    Query(request): Query<DatatableRequest>,
) -> Result<impl IntoResponse> {
    let registry = app.datatables()?;
    let dt = registry.get(&id)
        .ok_or_else(|| Error::not_found("datatable not found"))?;
    Ok(Json(dt.json(&app, Some(&actor), request).await?))
}

pub async fn download(
    State(app): State<AppContext>,
    CurrentActor(actor): CurrentActor,
    Path(id): Path<String>,
    Query(request): Query<DatatableRequest>,
) -> Result<Response> {
    let registry = app.datatables()?;
    let dt = registry.get(&id)
        .ok_or_else(|| Error::not_found("datatable not found"))?;
    dt.download(&app, Some(&actor), request).await
}
