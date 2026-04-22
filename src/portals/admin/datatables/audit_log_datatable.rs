use async_trait::async_trait;
use forge::prelude::*;
use forge::AuditLog;

pub struct AuditLogDatatable;

#[async_trait]
impl Datatable for AuditLogDatatable {
    type Row = AuditLog;
    type Query = ModelQuery<AuditLog>;
    const ID: &'static str = "admin.audit_logs";

    fn query(_ctx: &DatatableContext) -> Self::Query {
        AuditLog::model_query()
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(AuditLog::EVENT_TYPE)
                .label("Event")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AuditLog::AREA)
                .label("Area")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AuditLog::ACTOR_GUARD)
                .label("Guard")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AuditLog::ACTOR_ID)
                .label("Actor")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AuditLog::SUBJECT_TABLE)
                .label("Subject Table")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AuditLog::SUBJECT_ID)
                .label("Subject ID")
                .filterable()
                .exportable(),
            DatatableColumn::field(AuditLog::REQUEST_ID)
                .label("Request ID")
                .exportable(),
            DatatableColumn::field(AuditLog::IP)
                .label("IP")
                .exportable(),
            DatatableColumn::field(AuditLog::CREATED_AT)
                .label("Created")
                .sortable()
                .filterable()
                .exportable(),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![DatatableSort::desc(AuditLog::CREATED_AT)]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text_search_fields(
                    "search",
                    "Search",
                    [
                        AuditLog::EVENT_TYPE,
                        AuditLog::SUBJECT_TABLE,
                        AuditLog::SUBJECT_ID,
                    ],
                )
                .placeholder("Event, subject..."),
                DatatableFilterField::text_like("actor_id", "Actor ID").placeholder("Actor..."),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::text_like("area", "Area").placeholder("admin, ..."),
                DatatableFilterField::text_like("actor_guard", "Guard")
                    .placeholder("admin, user..."),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::date_from("created_from", "From").bind(
                    "created_at",
                    DatatableFilterOp::DateFrom,
                    DatatableFilterValueKind::Date,
                ),
                DatatableFilterField::date_to("created_to", "To").bind(
                    "created_at",
                    DatatableFilterOp::DateTo,
                    DatatableFilterValueKind::Date,
                ),
            ),
        ])
    }
}
