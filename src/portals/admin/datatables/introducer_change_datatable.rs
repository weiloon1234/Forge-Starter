use async_trait::async_trait;
use forge::datatable::column::DatatableFieldRef;
use forge::prelude::*;
use serde::Serialize;

const INTRODUCER_CHANGES_TABLE: &str = "admin_user_introducer_changes";

#[derive(Clone, Debug, Serialize, forge::Projection)]
pub struct IntroducerChangeDatatableRow {
    id: String,
    created_at: DateTime,
    admin_username: String,
    admin_label: String,
    user_username: Option<String>,
    user_label: String,
    from_introducer_username: Option<String>,
    from_introducer_label: String,
    to_introducer_username: Option<String>,
    to_introducer_label: String,
}

fn snapshot_label_expr(username_column: &str, id_column: &str) -> Expr {
    Sql::coalesce([
        Expr::column(ColumnRef::new(INTRODUCER_CHANGES_TABLE, username_column)),
        Expr::raw(format!(
            r#""{INTRODUCER_CHANGES_TABLE}"."{id_column}"::text"#
        )),
    ])
}

pub struct IntroducerChangeDatatable;

#[async_trait]
impl Datatable for IntroducerChangeDatatable {
    type Row = IntroducerChangeDatatableRow;
    type Query = ProjectionQuery<IntroducerChangeDatatableRow>;

    const ID: &'static str = "admin.introducer_changes";

    fn query(_ctx: &DatatableContext) -> Self::Query {
        IntroducerChangeDatatableRow::source(INTRODUCER_CHANGES_TABLE)
            .select_field(
                IntroducerChangeDatatableRow::ID,
                Expr::raw(r#""admin_user_introducer_changes"."id"::text"#),
            )
            .select_field(
                IntroducerChangeDatatableRow::CREATED_AT,
                ColumnRef::new(INTRODUCER_CHANGES_TABLE, "created_at"),
            )
            .select_field(
                IntroducerChangeDatatableRow::ADMIN_USERNAME,
                ColumnRef::new(INTRODUCER_CHANGES_TABLE, "admin_username"),
            )
            .select_field(
                IntroducerChangeDatatableRow::ADMIN_LABEL,
                snapshot_label_expr("admin_username", "admin_id"),
            )
            .select_field(
                IntroducerChangeDatatableRow::USER_USERNAME,
                ColumnRef::new(INTRODUCER_CHANGES_TABLE, "user_username"),
            )
            .select_field(
                IntroducerChangeDatatableRow::USER_LABEL,
                snapshot_label_expr("user_username", "user_id"),
            )
            .select_field(
                IntroducerChangeDatatableRow::FROM_INTRODUCER_USERNAME,
                ColumnRef::new(INTRODUCER_CHANGES_TABLE, "from_introducer_username"),
            )
            .select_field(
                IntroducerChangeDatatableRow::FROM_INTRODUCER_LABEL,
                snapshot_label_expr("from_introducer_username", "from_introducer_user_id"),
            )
            .select_field(
                IntroducerChangeDatatableRow::TO_INTRODUCER_USERNAME,
                ColumnRef::new(INTRODUCER_CHANGES_TABLE, "to_introducer_username"),
            )
            .select_field(
                IntroducerChangeDatatableRow::TO_INTRODUCER_LABEL,
                snapshot_label_expr("to_introducer_username", "to_introducer_user_id"),
            )
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(IntroducerChangeDatatableRow::CREATED_AT)
                .label("admin.introducer_changes.columns.created")
                .sort_by(ColumnRef::new(INTRODUCER_CHANGES_TABLE, "created_at"))
                .exportable(),
            DatatableColumn::field(IntroducerChangeDatatableRow::USER_LABEL)
                .label("admin.introducer_changes.columns.user")
                .sort_by(snapshot_label_expr("user_username", "user_id"))
                .filter_by(snapshot_label_expr("user_username", "user_id"))
                .exportable(),
            DatatableColumn::field(IntroducerChangeDatatableRow::FROM_INTRODUCER_LABEL)
                .label("admin.introducer_changes.columns.from_introducer")
                .sort_by(snapshot_label_expr(
                    "from_introducer_username",
                    "from_introducer_user_id",
                ))
                .filter_by(snapshot_label_expr(
                    "from_introducer_username",
                    "from_introducer_user_id",
                ))
                .exportable(),
            DatatableColumn::field(IntroducerChangeDatatableRow::TO_INTRODUCER_LABEL)
                .label("admin.introducer_changes.columns.to_introducer")
                .sort_by(snapshot_label_expr(
                    "to_introducer_username",
                    "to_introducer_user_id",
                ))
                .filter_by(snapshot_label_expr(
                    "to_introducer_username",
                    "to_introducer_user_id",
                ))
                .exportable(),
            DatatableColumn::field(IntroducerChangeDatatableRow::ADMIN_LABEL)
                .label("admin.introducer_changes.columns.admin")
                .sort_by(snapshot_label_expr("admin_username", "admin_id"))
                .filter_by(snapshot_label_expr("admin_username", "admin_id"))
                .exportable(),
            DatatableColumn::field(IntroducerChangeDatatableRow::USER_USERNAME)
                .filter_by(ColumnRef::new(INTRODUCER_CHANGES_TABLE, "user_username")),
            DatatableColumn::field(IntroducerChangeDatatableRow::FROM_INTRODUCER_USERNAME)
                .filter_by(ColumnRef::new(
                    INTRODUCER_CHANGES_TABLE,
                    "from_introducer_username",
                )),
            DatatableColumn::field(IntroducerChangeDatatableRow::TO_INTRODUCER_USERNAME).filter_by(
                ColumnRef::new(INTRODUCER_CHANGES_TABLE, "to_introducer_username"),
            ),
            DatatableColumn::field(IntroducerChangeDatatableRow::ADMIN_USERNAME)
                .filter_by(ColumnRef::new(INTRODUCER_CHANGES_TABLE, "admin_username")),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![DatatableSort::desc(
            IntroducerChangeDatatableRow::CREATED_AT,
        )]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::single(
                DatatableFilterField::text_search_fields(
                    "search",
                    "Search",
                    [
                        DatatableFieldRef::<Self::Row>::from(
                            IntroducerChangeDatatableRow::USER_LABEL,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            IntroducerChangeDatatableRow::FROM_INTRODUCER_LABEL,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            IntroducerChangeDatatableRow::TO_INTRODUCER_LABEL,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            IntroducerChangeDatatableRow::ADMIN_LABEL,
                        ),
                    ],
                )
                .placeholder("admin.introducer_changes.search_placeholder"),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::text_like(
                    "from_introducer_username",
                    "From introducer username",
                )
                .placeholder("From introducer username"),
                DatatableFilterField::text_like("to_introducer_username", "To introducer username")
                    .placeholder("To introducer username"),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::date_from("created_from", "Created from").bind(
                    IntroducerChangeDatatableRow::CREATED_AT.alias(),
                    DatatableFilterOp::DateFrom,
                    DatatableFilterValueKind::Date,
                ),
                DatatableFilterField::date_to("created_to", "Created to").bind(
                    IntroducerChangeDatatableRow::CREATED_AT.alias(),
                    DatatableFilterOp::DateTo,
                    DatatableFilterValueKind::Date,
                ),
            ),
        ])
    }
}
