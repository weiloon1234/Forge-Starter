use std::collections::HashMap;

use forge::database::{DbType, Pagination};
use forge::datatable::filter_engine::{apply_auto_filters, apply_default_sorts, apply_sorts};
use forge::prelude::*;
use forge::{DatatableColumnMeta, DatatablePaginationMeta, DatatableQuery};
use serde::Serialize;

pub async fn build_json_response<D>(
    app: &AppContext,
    actor: Option<&Actor>,
    request: DatatableRequest,
    locale: Option<&str>,
    timezone: Timezone,
) -> Result<DatatableJsonResponse>
where
    D: Datatable + ?Sized,
    D::Row: Serialize,
{
    let columns = D::columns();
    let request = normalize_request(request, &columns, &timezone)?;
    let ctx = datatable_context(app, actor, &request, locale, timezone);
    let query = prepare_query::<D>(&ctx, &columns).await?;

    let pagination = Pagination::new(request.page, request.per_page);
    let db = app.database()?;
    let paginated = query.paginate(db.as_ref(), pagination).await?;

    let mappings = D::mappings();
    let rows = build_rows(&paginated.data, &columns, &mappings, &ctx)?;

    let columns = columns
        .iter()
        .map(|column| DatatableColumnMeta {
            name: column.name.clone(),
            label: column.label.clone(),
            sortable: column.sortable,
            filterable: column.filterable,
        })
        .collect();

    let filters = D::available_filters(&ctx).await?;
    let pagination = DatatablePaginationMeta::new(
        paginated.pagination.page,
        paginated.pagination.per_page,
        paginated.total,
    );

    Ok(DatatableJsonResponse {
        rows,
        columns,
        filters,
        pagination,
        applied_filters: request.filters,
        sorts: request.sort,
    })
}

pub async fn build_download_response<D>(
    app: &AppContext,
    actor: Option<&Actor>,
    request: DatatableRequest,
    locale: Option<&str>,
    timezone: Timezone,
) -> Result<Response>
where
    D: Datatable + ?Sized,
    D::Row: Serialize,
{
    let bytes = build_xlsx_bytes::<D>(app, actor, request, locale, timezone).await?;
    let filename = format!("{}.xlsx", D::ID);

    Response::builder()
        .header(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
        .header(
            "Content-Disposition",
            format!("attachment; filename=\"{filename}\""),
        )
        .body(axum::body::Body::from(bytes))
        .map_err(|error| Error::message(format!("failed to build download response: {error}")))
}

async fn build_xlsx_bytes<D>(
    app: &AppContext,
    actor: Option<&Actor>,
    request: DatatableRequest,
    locale: Option<&str>,
    timezone: Timezone,
) -> Result<Vec<u8>>
where
    D: Datatable + ?Sized,
    D::Row: Serialize,
{
    let columns = D::columns();
    let request = normalize_request(request, &columns, &timezone)?;
    let ctx = datatable_context(app, actor, &request, locale, timezone);
    let query = prepare_query::<D>(&ctx, &columns).await?;

    let db = app.database()?;
    let data = query.get(db.as_ref()).await?;
    let exportable_columns: Vec<&DatatableColumn<D::Row>> =
        columns.iter().filter(|column| column.exportable).collect();
    let mappings = D::mappings();

    build_xlsx(&data, &exportable_columns, &mappings, &ctx)
}

fn datatable_context<'a>(
    app: &'a AppContext,
    actor: Option<&'a Actor>,
    request: &'a DatatableRequest,
    locale: Option<&'a str>,
    timezone: Timezone,
) -> DatatableContext<'a> {
    let mut ctx = DatatableContext::new(app, actor, request);
    ctx.locale = locale;
    ctx.timezone = timezone;
    ctx
}

async fn prepare_query<D>(
    ctx: &DatatableContext<'_>,
    columns: &[DatatableColumn<D::Row>],
) -> Result<D::Query>
where
    D: Datatable + ?Sized,
{
    let query = D::query(ctx);
    let query = apply_auto_filters(query, &ctx.request.filters, columns)?;
    let query = D::filters(ctx, query).await?;

    if ctx.request.sort.is_empty() {
        apply_default_sorts(query, &D::default_sort())
    } else {
        apply_sorts(query, &ctx.request.sort, columns)
    }
}

fn normalize_request<Row: 'static>(
    request: DatatableRequest,
    columns: &[DatatableColumn<Row>],
    timezone: &Timezone,
) -> Result<DatatableRequest> {
    Ok(DatatableRequest {
        filters: normalize_filters(request.filters, columns, timezone)?,
        ..request
    })
}

fn normalize_filters<Row: 'static>(
    filters: Vec<DatatableFilterInput>,
    columns: &[DatatableColumn<Row>],
    timezone: &Timezone,
) -> Result<Vec<DatatableFilterInput>> {
    let column_types = columns
        .iter()
        .map(|column| (column.name.as_str(), column.db_type()))
        .collect::<HashMap<_, _>>();

    let mut normalized = Vec::with_capacity(filters.len());
    for filter in filters {
        let Some(db_type) = column_types.get(filter.field.as_str()).copied() else {
            normalized.push(filter);
            continue;
        };

        if matches!(
            filter.op,
            DatatableFilterOp::Date | DatatableFilterOp::DateFrom | DatatableFilterOp::DateTo
        ) && matches!(db_type, DbType::Timestamp | DbType::TimestampTz)
        {
            expand_local_date_filter(filter, db_type, timezone, &mut normalized)?;
            continue;
        }

        normalized.push(filter);
    }

    Ok(normalized)
}

fn expand_local_date_filter(
    filter: DatatableFilterInput,
    db_type: DbType,
    timezone: &Timezone,
    normalized: &mut Vec<DatatableFilterInput>,
) -> Result<()> {
    let DatatableFilterValue::Text(value) = &filter.value else {
        normalized.push(filter);
        return Ok(());
    };

    let (start, end) = local_day_range(value, db_type, timezone)?;

    match filter.op {
        DatatableFilterOp::Date => {
            normalized.push(DatatableFilterInput {
                field: filter.field.clone(),
                op: DatatableFilterOp::Gte,
                value: DatatableFilterValue::Text(start),
            });
            normalized.push(DatatableFilterInput {
                field: filter.field,
                op: DatatableFilterOp::Lt,
                value: DatatableFilterValue::Text(end),
            });
        }
        DatatableFilterOp::DateFrom => {
            normalized.push(DatatableFilterInput {
                field: filter.field,
                op: DatatableFilterOp::Gte,
                value: DatatableFilterValue::Text(start),
            });
        }
        DatatableFilterOp::DateTo => {
            normalized.push(DatatableFilterInput {
                field: filter.field,
                op: DatatableFilterOp::Lt,
                value: DatatableFilterValue::Text(end),
            });
        }
        _ => normalized.push(filter),
    }

    Ok(())
}

fn local_day_range(value: &str, db_type: DbType, timezone: &Timezone) -> Result<(String, String)> {
    let start = DateTime::parse_in_timezone(format!("{value}T00:00:00"), timezone)?;
    let end = start.add_days(1);

    Ok((
        format_datetime_boundary(&start, db_type),
        format_datetime_boundary(&end, db_type),
    ))
}

fn format_datetime_boundary(value: &DateTime, db_type: DbType) -> String {
    match db_type {
        DbType::Timestamp => value.local_datetime_in(&Timezone::utc()).format(),
        DbType::TimestampTz => value.format(),
        _ => value.format(),
    }
}

fn build_rows<Row>(
    data: &Collection<Row>,
    columns: &[DatatableColumn<Row>],
    mappings: &[DatatableMapping<Row>],
    ctx: &DatatableContext<'_>,
) -> Result<Vec<serde_json::Map<String, serde_json::Value>>>
where
    Row: Serialize,
{
    let mapping_index = mappings
        .iter()
        .map(|mapping| (mapping.name.as_str(), mapping))
        .collect::<HashMap<_, _>>();

    let mut rows = Vec::with_capacity(data.len());

    for row in data.iter() {
        let row_value = serde_json::to_value(row)
            .map_err(|error| Error::message(format!("failed to serialize row: {error}")))?;

        let object = match &row_value {
            serde_json::Value::Object(object) => object,
            _ => continue,
        };

        let mut map = serde_json::Map::new();

        for column in columns {
            if let Some(mapping) = mapping_index.get(column.name.as_str()) {
                let value: serde_json::Value = mapping.compute(row, ctx).into();
                map.insert(column.name.clone(), value);
            } else if let Some(value) = object.get(&column.name) {
                map.insert(column.name.clone(), value.clone());
            }
        }

        for mapping in mappings {
            if !map.contains_key(&mapping.name) {
                let value: serde_json::Value = mapping.compute(row, ctx).into();
                map.insert(mapping.name.clone(), value);
            }
        }

        rows.push(map);
    }

    Ok(rows)
}

fn build_xlsx<Row>(
    data: &Collection<Row>,
    columns: &[&DatatableColumn<Row>],
    mappings: &[DatatableMapping<Row>],
    ctx: &DatatableContext<'_>,
) -> Result<Vec<u8>>
where
    Row: Serialize,
{
    use rust_xlsxwriter::{Format, Workbook};

    let mapping_index = mappings
        .iter()
        .map(|mapping| (mapping.name.as_str(), mapping))
        .collect::<HashMap<_, _>>();

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    let header_format = Format::new().set_bold();

    for (column_index, column) in columns.iter().enumerate() {
        worksheet
            .write_string_with_format(0, column_index as u16, &column.label, &header_format)
            .map_err(|error| Error::message(format!("xlsx write error: {error}")))?;
    }

    for (row_index, row) in data.iter().enumerate() {
        let row_index = (row_index + 1) as u32;
        let row_value = serde_json::to_value(row)
            .map_err(|error| Error::message(format!("failed to serialize row: {error}")))?;
        let object = match &row_value {
            serde_json::Value::Object(object) => object,
            _ => continue,
        };

        for (column_index, column) in columns.iter().enumerate() {
            let value = if let Some(mapping) = mapping_index.get(column.name.as_str()) {
                mapping.compute(row, ctx).into()
            } else {
                object
                    .get(&column.name)
                    .cloned()
                    .unwrap_or(serde_json::Value::Null)
            };

            write_cell(worksheet, row_index, column_index as u16, &value)
                .map_err(|error| Error::message(format!("xlsx write error: {error}")))?;
        }
    }

    for column_index in 0..columns.len() {
        worksheet
            .set_column_width(column_index as u16, 15)
            .map_err(|error| Error::message(format!("xlsx format error: {error}")))?;
    }

    workbook
        .save_to_buffer()
        .map_err(|error| Error::message(format!("xlsx save error: {error}")))
}

fn write_cell(
    worksheet: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    column: u16,
    value: &serde_json::Value,
) -> std::result::Result<(), rust_xlsxwriter::XlsxError> {
    match value {
        serde_json::Value::Null => worksheet.write_string(row, column, ""),
        serde_json::Value::Bool(value) => worksheet.write_boolean(row, column, *value),
        serde_json::Value::Number(value) => {
            if let Some(value) = value.as_f64() {
                worksheet.write_number(row, column, value)
            } else {
                worksheet.write_string(row, column, value.to_string())
            }
        }
        serde_json::Value::String(value) => worksheet.write_string(row, column, value),
        serde_json::Value::Array(_) | serde_json::Value::Object(_) => {
            worksheet.write_string(row, column, value.to_string())
        }
    }?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::local_day_range;
    use forge::database::DbType;
    use forge::prelude::Timezone;

    #[test]
    fn local_day_range_for_timestamptz_uses_timezone_boundaries() {
        let timezone = Timezone::parse("Asia/Kuala_Lumpur").unwrap();
        let (start, end) = local_day_range("2026-04-21", DbType::TimestampTz, &timezone).unwrap();

        assert_eq!(start, "2026-04-20T16:00:00+00:00");
        assert_eq!(end, "2026-04-21T16:00:00+00:00");
    }

    #[test]
    fn local_day_range_for_timestamp_emits_utc_local_datetime() {
        let timezone = Timezone::parse("Asia/Kuala_Lumpur").unwrap();
        let (start, end) = local_day_range("2026-04-21", DbType::Timestamp, &timezone).unwrap();

        assert_eq!(start, "2026-04-20T16:00:00");
        assert_eq!(end, "2026-04-21T16:00:00");
    }
}
