use async_trait::async_trait;
use forge::datatable::column::DatatableFieldRef;
use forge::prelude::*;
use serde::Serialize;

const USERS_TABLE: &str = "users";
const INTRODUCERS_TABLE: &str = "introducer_users";

#[derive(Clone, Debug, Serialize, forge::Projection)]
pub struct UserDatatableRow {
    id: String,
    introducer_user_id: Option<String>,
    introducer_label: Option<String>,
    username: Option<String>,
    email: Option<String>,
    name: Option<String>,
    credit_1: Numeric,
    country_iso2: Option<String>,
    contact_country_iso2: Option<String>,
    contact_number: Option<String>,
    created_at: DateTime,
}

fn introducer_label_expr() -> Expr {
    Sql::coalesce([
        Expr::column(ColumnRef::new(INTRODUCERS_TABLE, "name")),
        Expr::column(ColumnRef::new(INTRODUCERS_TABLE, "username")),
        Expr::column(ColumnRef::new(INTRODUCERS_TABLE, "email")),
        Expr::raw(r#""users"."introducer_user_id"::text"#),
    ])
}

pub struct UserDatatable;

#[async_trait]
impl Datatable for UserDatatable {
    type Row = UserDatatableRow;
    type Query = ProjectionQuery<UserDatatableRow>;
    const ID: &'static str = "admin.users";

    fn query(_ctx: &DatatableContext) -> Self::Query {
        UserDatatableRow::source(USERS_TABLE)
            .left_join(
                TableRef::new(USERS_TABLE).aliased(INTRODUCERS_TABLE),
                Condition::compare(
                    Expr::column(ColumnRef::new(USERS_TABLE, "introducer_user_id")),
                    ComparisonOp::Eq,
                    Expr::column(ColumnRef::new(INTRODUCERS_TABLE, "id")),
                ),
            )
            .select_field(UserDatatableRow::ID, Expr::raw(r#""users"."id"::text"#))
            .select_field(
                UserDatatableRow::INTRODUCER_USER_ID,
                Expr::raw(r#""users"."introducer_user_id"::text"#),
            )
            .select_field(UserDatatableRow::INTRODUCER_LABEL, introducer_label_expr())
            .select_field(
                UserDatatableRow::USERNAME,
                ColumnRef::new(USERS_TABLE, "username"),
            )
            .select_field(
                UserDatatableRow::EMAIL,
                ColumnRef::new(USERS_TABLE, "email"),
            )
            .select_field(UserDatatableRow::NAME, ColumnRef::new(USERS_TABLE, "name"))
            .select_field(
                UserDatatableRow::CREDIT_1,
                ColumnRef::new(USERS_TABLE, "credit_1"),
            )
            .select_field(
                UserDatatableRow::COUNTRY_ISO2,
                ColumnRef::new(USERS_TABLE, "country_iso2"),
            )
            .select_field(
                UserDatatableRow::CONTACT_COUNTRY_ISO2,
                ColumnRef::new(USERS_TABLE, "contact_country_iso2"),
            )
            .select_field(
                UserDatatableRow::CONTACT_NUMBER,
                ColumnRef::new(USERS_TABLE, "contact_number"),
            )
            .select_field(
                UserDatatableRow::CREATED_AT,
                ColumnRef::new(USERS_TABLE, "created_at"),
            )
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(UserDatatableRow::ID),
            DatatableColumn::field(UserDatatableRow::USERNAME)
                .label("Username")
                .sort_by(ColumnRef::new(USERS_TABLE, "username"))
                .filter_by(ColumnRef::new(USERS_TABLE, "username"))
                .exportable(),
            DatatableColumn::field(UserDatatableRow::EMAIL)
                .label("Email")
                .sort_by(ColumnRef::new(USERS_TABLE, "email"))
                .filter_by(ColumnRef::new(USERS_TABLE, "email"))
                .exportable(),
            DatatableColumn::field(UserDatatableRow::NAME)
                .label("Name")
                .sort_by(ColumnRef::new(USERS_TABLE, "name"))
                .filter_by(ColumnRef::new(USERS_TABLE, "name"))
                .exportable(),
            DatatableColumn::field(UserDatatableRow::INTRODUCER_LABEL)
                .label("admin.users.columns.introducer")
                .sort_by(introducer_label_expr())
                .filter_by(introducer_label_expr())
                .exportable(),
            DatatableColumn::field(UserDatatableRow::CREDIT_1)
                .label("enum.credit_type.credit_1")
                .sort_by(ColumnRef::new(USERS_TABLE, "credit_1"))
                .exportable(),
            DatatableColumn::field(UserDatatableRow::COUNTRY_ISO2)
                .label("Country")
                .sort_by(ColumnRef::new(USERS_TABLE, "country_iso2"))
                .filter_by(ColumnRef::new(USERS_TABLE, "country_iso2"))
                .exportable(),
            DatatableColumn::field(UserDatatableRow::CONTACT_COUNTRY_ISO2)
                .label("Contact country")
                .sort_by(ColumnRef::new(USERS_TABLE, "contact_country_iso2"))
                .filter_by(ColumnRef::new(USERS_TABLE, "contact_country_iso2"))
                .exportable(),
            DatatableColumn::field(UserDatatableRow::CONTACT_NUMBER)
                .label("Contact number")
                .sort_by(ColumnRef::new(USERS_TABLE, "contact_number"))
                .filter_by(ColumnRef::new(USERS_TABLE, "contact_number"))
                .exportable(),
            DatatableColumn::field(UserDatatableRow::CREATED_AT)
                .label("Created")
                .sort_by(ColumnRef::new(USERS_TABLE, "created_at"))
                .exportable(),
            DatatableColumn::field(UserDatatableRow::INTRODUCER_USER_ID),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![DatatableSort::desc(UserDatatableRow::CREATED_AT)]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text_search_fields(
                    "search",
                    "admin.datatable.filters.search",
                    [
                        DatatableFieldRef::<Self::Row>::from(UserDatatableRow::USERNAME),
                        DatatableFieldRef::<Self::Row>::from(UserDatatableRow::EMAIL),
                        DatatableFieldRef::<Self::Row>::from(UserDatatableRow::NAME),
                        DatatableFieldRef::<Self::Row>::from(UserDatatableRow::INTRODUCER_LABEL),
                    ],
                )
                .placeholder("admin.users.search_placeholder"),
                DatatableFilterField::text_like(
                    "contact_number",
                    "admin.datatable.filters.contact_number",
                )
                .placeholder("admin.datatable.placeholders.search_contact_number"),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::text_like("country_iso2", "admin.datatable.filters.country")
                    .placeholder("admin.datatable.placeholders.search_country_iso2"),
                DatatableFilterField::text_like(
                    "contact_country_iso2",
                    "admin.datatable.filters.contact_country",
                )
                .placeholder("admin.datatable.placeholders.search_contact_country_iso2"),
            ),
        ])
    }
}
