use async_trait::async_trait;
use forge::datatable::column::DatatableFieldRef;
use forge::prelude::*;
use serde::Serialize;

const AUDIT_LOGS_TABLE: &str = "audit_logs";
const ADMINS_TABLE: &str = "admins";
const USERS_TABLE: &str = "users";

#[derive(Clone, Debug, Serialize, forge::Projection)]
pub struct AuditLogDatatableRow {
    id: String,
    event_type: String,
    area: Option<String>,
    actor_guard: Option<String>,
    actor_id: Option<String>,
    actor_label: Option<String>,
    subject_model: String,
    subject_table: String,
    subject_id: String,
    request_id: Option<String>,
    ip: Option<String>,
    user_agent: Option<String>,
    before_data: Option<serde_json::Value>,
    after_data: Option<serde_json::Value>,
    changes: Option<serde_json::Value>,
    created_at: DateTime,
}

/// COALESCE(admins.username, users.username, users.email, users.name) —
/// whichever populated column lands first becomes the actor's human label.
fn actor_label_expr() -> Expr {
    Sql::coalesce([
        Expr::column(ColumnRef::new(ADMINS_TABLE, "username")),
        Expr::column(ColumnRef::new(USERS_TABLE, "username")),
        Expr::column(ColumnRef::new(USERS_TABLE, "email")),
        Expr::column(ColumnRef::new(USERS_TABLE, "name")),
    ])
}

pub struct AuditLogDatatable;

#[async_trait]
impl Datatable for AuditLogDatatable {
    type Row = AuditLogDatatableRow;
    type Query = ProjectionQuery<AuditLogDatatableRow>;
    const ID: &'static str = "admin.audit_logs";

    fn query(_ctx: &DatatableContext) -> Self::Query {
        AuditLogDatatableRow::source(AUDIT_LOGS_TABLE)
            .left_join(
                TableRef::new(ADMINS_TABLE),
                Condition::and([
                    Condition::compare(
                        Expr::column(ColumnRef::new(AUDIT_LOGS_TABLE, "actor_guard")),
                        ComparisonOp::Eq,
                        Expr::raw("'admin'"),
                    ),
                    Condition::compare(
                        Expr::raw(r#""admins"."id"::text"#),
                        ComparisonOp::Eq,
                        Expr::column(ColumnRef::new(AUDIT_LOGS_TABLE, "actor_id")),
                    ),
                ]),
            )
            .left_join(
                TableRef::new(USERS_TABLE),
                Condition::and([
                    Condition::compare(
                        Expr::column(ColumnRef::new(AUDIT_LOGS_TABLE, "actor_guard")),
                        ComparisonOp::Eq,
                        Expr::raw("'user'"),
                    ),
                    Condition::compare(
                        Expr::raw(r#""users"."id"::text"#),
                        ComparisonOp::Eq,
                        Expr::column(ColumnRef::new(AUDIT_LOGS_TABLE, "actor_id")),
                    ),
                ]),
            )
            .select_field(
                AuditLogDatatableRow::ID,
                Expr::raw(r#""audit_logs"."id"::text"#),
            )
            .select_field(
                AuditLogDatatableRow::EVENT_TYPE,
                ColumnRef::new(AUDIT_LOGS_TABLE, "event_type"),
            )
            .select_field(
                AuditLogDatatableRow::AREA,
                ColumnRef::new(AUDIT_LOGS_TABLE, "area"),
            )
            .select_field(
                AuditLogDatatableRow::ACTOR_GUARD,
                ColumnRef::new(AUDIT_LOGS_TABLE, "actor_guard"),
            )
            .select_field(
                AuditLogDatatableRow::ACTOR_ID,
                ColumnRef::new(AUDIT_LOGS_TABLE, "actor_id"),
            )
            .select_field(AuditLogDatatableRow::ACTOR_LABEL, actor_label_expr())
            .select_field(
                AuditLogDatatableRow::SUBJECT_MODEL,
                ColumnRef::new(AUDIT_LOGS_TABLE, "subject_model"),
            )
            .select_field(
                AuditLogDatatableRow::SUBJECT_TABLE,
                ColumnRef::new(AUDIT_LOGS_TABLE, "subject_table"),
            )
            .select_field(
                AuditLogDatatableRow::SUBJECT_ID,
                ColumnRef::new(AUDIT_LOGS_TABLE, "subject_id"),
            )
            .select_field(
                AuditLogDatatableRow::REQUEST_ID,
                ColumnRef::new(AUDIT_LOGS_TABLE, "request_id"),
            )
            .select_field(
                AuditLogDatatableRow::IP,
                ColumnRef::new(AUDIT_LOGS_TABLE, "ip"),
            )
            .select_field(
                AuditLogDatatableRow::USER_AGENT,
                ColumnRef::new(AUDIT_LOGS_TABLE, "user_agent"),
            )
            .select_field(
                AuditLogDatatableRow::BEFORE_DATA,
                ColumnRef::new(AUDIT_LOGS_TABLE, "before_data"),
            )
            .select_field(
                AuditLogDatatableRow::AFTER_DATA,
                ColumnRef::new(AUDIT_LOGS_TABLE, "after_data"),
            )
            .select_field(
                AuditLogDatatableRow::CHANGES,
                ColumnRef::new(AUDIT_LOGS_TABLE, "changes"),
            )
            .select_field(
                AuditLogDatatableRow::CREATED_AT,
                ColumnRef::new(AUDIT_LOGS_TABLE, "created_at"),
            )
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(AuditLogDatatableRow::EVENT_TYPE)
                .label("Event")
                .sort_by(ColumnRef::new(AUDIT_LOGS_TABLE, "event_type"))
                .filter_by(ColumnRef::new(AUDIT_LOGS_TABLE, "event_type"))
                .exportable(),
            DatatableColumn::field(AuditLogDatatableRow::ACTOR_LABEL)
                .label("Actor")
                .sort_by(actor_label_expr())
                .filter_by(actor_label_expr())
                .exportable(),
            DatatableColumn::field(AuditLogDatatableRow::ACTOR_ID)
                .label("Actor ID")
                .sort_by(ColumnRef::new(AUDIT_LOGS_TABLE, "actor_id"))
                .filter_by(ColumnRef::new(AUDIT_LOGS_TABLE, "actor_id"))
                .exportable(),
            DatatableColumn::field(AuditLogDatatableRow::SUBJECT_TABLE)
                .label("Subject Table")
                .sort_by(ColumnRef::new(AUDIT_LOGS_TABLE, "subject_table"))
                .filter_by(ColumnRef::new(AUDIT_LOGS_TABLE, "subject_table"))
                .exportable(),
            DatatableColumn::field(AuditLogDatatableRow::SUBJECT_ID)
                .label("Subject ID")
                .filter_by(ColumnRef::new(AUDIT_LOGS_TABLE, "subject_id"))
                .exportable(),
            DatatableColumn::field(AuditLogDatatableRow::REQUEST_ID)
                .label("Request ID")
                .exportable(),
            DatatableColumn::field(AuditLogDatatableRow::IP)
                .label("IP")
                .exportable(),
            DatatableColumn::field(AuditLogDatatableRow::CREATED_AT)
                .label("Created")
                .sort_by(ColumnRef::new(AUDIT_LOGS_TABLE, "created_at"))
                .exportable(),
            // Hidden columns — included in the response so the drawer can read
            // them, but not rendered as visible columns on the datatable grid.
            DatatableColumn::field(AuditLogDatatableRow::AREA),
            DatatableColumn::field(AuditLogDatatableRow::ACTOR_GUARD),
            DatatableColumn::field(AuditLogDatatableRow::SUBJECT_MODEL),
            DatatableColumn::field(AuditLogDatatableRow::USER_AGENT),
            DatatableColumn::field(AuditLogDatatableRow::BEFORE_DATA),
            DatatableColumn::field(AuditLogDatatableRow::AFTER_DATA),
            DatatableColumn::field(AuditLogDatatableRow::CHANGES),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![DatatableSort::desc(AuditLogDatatableRow::CREATED_AT)]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text_search_fields(
                    "search",
                    "Search",
                    [
                        DatatableFieldRef::<Self::Row>::from(AuditLogDatatableRow::EVENT_TYPE),
                        DatatableFieldRef::<Self::Row>::from(AuditLogDatatableRow::SUBJECT_TABLE),
                        DatatableFieldRef::<Self::Row>::from(AuditLogDatatableRow::SUBJECT_ID),
                    ],
                )
                .placeholder("Event, subject..."),
                DatatableFilterField::text_search_fields(
                    "actor",
                    "Actor",
                    [DatatableFieldRef::<Self::Row>::from(
                        AuditLogDatatableRow::ACTOR_LABEL,
                    )],
                )
                .placeholder("Username..."),
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
