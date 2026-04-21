use async_trait::async_trait;
use forge::datatable::column::DatatableFieldRef;
use forge::prelude::*;
use serde::Serialize;

use crate::domain::enums::{CreditTransactionType, CreditType};
use crate::domain::models::User;

const TRANSACTIONS_TABLE: &str = "credit_transactions";
const USERS_TABLE: &str = "users";

#[derive(Clone, Debug, Serialize, forge::Projection)]
pub struct CreditTransactionDatatableRow {
    id: String,
    user_id: String,
    user_name: Option<String>,
    user_username: Option<String>,
    user_email: Option<String>,
    user_label: String,
    credit_type: String,
    transaction_type: String,
    amount: Numeric,
    related_key: Option<String>,
    related_type: Option<String>,
    created_at: DateTime,
}

fn user_label_expr() -> Expr {
    Sql::coalesce([
        Expr::column(ColumnRef::new(USERS_TABLE, "name")),
        Expr::column(ColumnRef::new(USERS_TABLE, "username")),
        Expr::column(ColumnRef::new(USERS_TABLE, "email")),
        Expr::raw(r#""credit_transactions"."user_id"::text"#),
    ])
}

fn user_id_expr() -> Expr {
    Expr::raw(r#""credit_transactions"."user_id"::text"#)
}

fn credit_transaction_query() -> ProjectionQuery<CreditTransactionDatatableRow> {
    CreditTransactionDatatableRow::source(TRANSACTIONS_TABLE)
        .join(
            JoinKind::Inner,
            TableRef::new(USERS_TABLE),
            Condition::compare(
                Expr::column(ColumnRef::new(TRANSACTIONS_TABLE, "user_id")),
                ComparisonOp::Eq,
                Expr::column(ColumnRef::new(USERS_TABLE, "id")),
            ),
        )
        .select_field(
            CreditTransactionDatatableRow::ID,
            Expr::raw(r#""credit_transactions"."id"::text"#),
        )
        .select_field(CreditTransactionDatatableRow::USER_ID, user_id_expr())
        .select_field(
            CreditTransactionDatatableRow::USER_NAME,
            ColumnRef::new(USERS_TABLE, "name"),
        )
        .select_field(
            CreditTransactionDatatableRow::USER_USERNAME,
            ColumnRef::new(USERS_TABLE, "username"),
        )
        .select_field(
            CreditTransactionDatatableRow::USER_EMAIL,
            ColumnRef::new(USERS_TABLE, "email"),
        )
        .select_field(CreditTransactionDatatableRow::USER_LABEL, user_label_expr())
        .select_field(
            CreditTransactionDatatableRow::CREDIT_TYPE,
            ColumnRef::new(TRANSACTIONS_TABLE, "credit_type"),
        )
        .select_field(
            CreditTransactionDatatableRow::TRANSACTION_TYPE,
            ColumnRef::new(TRANSACTIONS_TABLE, "transaction_type"),
        )
        .select_field(
            CreditTransactionDatatableRow::AMOUNT,
            ColumnRef::new(TRANSACTIONS_TABLE, "amount"),
        )
        .select_field(
            CreditTransactionDatatableRow::RELATED_KEY,
            Expr::raw(r#""credit_transactions"."related_key"::text"#),
        )
        .select_field(
            CreditTransactionDatatableRow::RELATED_TYPE,
            ColumnRef::new(TRANSACTIONS_TABLE, "related_type"),
        )
        .select_field(
            CreditTransactionDatatableRow::CREATED_AT,
            ColumnRef::new(TRANSACTIONS_TABLE, "created_at"),
        )
}

fn no_rows_query(
    query: ProjectionQuery<CreditTransactionDatatableRow>,
) -> ProjectionQuery<CreditTransactionDatatableRow> {
    query.where_(Condition::compare(
        Expr::value(1),
        ComparisonOp::Eq,
        Expr::value(0),
    ))
}

fn fixed_text_filter<'a>(request: &'a DatatableRequest, field: &str) -> Option<&'a str> {
    request.filters.iter().find_map(|filter| {
        if filter.field != field || filter.op != DatatableFilterOp::Eq {
            return None;
        }

        match &filter.value {
            DatatableFilterValue::Text(value) => Some(value.as_str()),
            _ => None,
        }
    })
}

fn scoped_credit_transaction_filters(
    ctx: &DatatableContext,
    query: ProjectionQuery<CreditTransactionDatatableRow>,
) -> ProjectionQuery<CreditTransactionDatatableRow> {
    let Some(user_id) = fixed_text_filter(ctx.request, "user_id") else {
        return no_rows_query(query);
    };

    let Some(credit_type) = fixed_text_filter(ctx.request, "credit_type") else {
        return no_rows_query(query);
    };

    if user_id.parse::<ModelId<User>>().is_err() || CreditType::parse_key(credit_type).is_none() {
        return no_rows_query(query);
    }

    query
}

fn credit_transaction_columns() -> Vec<DatatableColumn<CreditTransactionDatatableRow>> {
    vec![
        DatatableColumn::field(CreditTransactionDatatableRow::USER_USERNAME)
            .label("Username")
            .sort_by(ColumnRef::new(USERS_TABLE, "username"))
            .filter_by(ColumnRef::new(USERS_TABLE, "username"))
            .exportable(),
        DatatableColumn::field(CreditTransactionDatatableRow::TRANSACTION_TYPE)
            .label("admin.credit_transactions.columns.transaction_type")
            .sort_by(ColumnRef::new(TRANSACTIONS_TABLE, "transaction_type"))
            .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "transaction_type"))
            .exportable(),
        DatatableColumn::field(CreditTransactionDatatableRow::AMOUNT)
            .label("admin.credit_transactions.columns.amount")
            .sort_by(ColumnRef::new(TRANSACTIONS_TABLE, "amount"))
            .exportable(),
        DatatableColumn::field(CreditTransactionDatatableRow::CREATED_AT)
            .label("admin.credit_transactions.columns.created")
            .sort_by(ColumnRef::new(TRANSACTIONS_TABLE, "created_at"))
            .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "created_at"))
            .exportable(),
        DatatableColumn::field(CreditTransactionDatatableRow::USER_NAME)
            .filter_by(ColumnRef::new(USERS_TABLE, "name")),
        DatatableColumn::field(CreditTransactionDatatableRow::USER_LABEL)
            .filter_by(user_label_expr()),
        DatatableColumn::field(CreditTransactionDatatableRow::USER_USERNAME)
            .filter_by(ColumnRef::new(USERS_TABLE, "username")),
        DatatableColumn::field(CreditTransactionDatatableRow::USER_EMAIL)
            .filter_by(ColumnRef::new(USERS_TABLE, "email")),
        DatatableColumn::field(CreditTransactionDatatableRow::USER_ID).filter_by(user_id_expr()),
        DatatableColumn::field(CreditTransactionDatatableRow::CREDIT_TYPE)
            .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "credit_type")),
        DatatableColumn::field(CreditTransactionDatatableRow::RELATED_TYPE)
            .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "related_type")),
        DatatableColumn::field(CreditTransactionDatatableRow::RELATED_KEY)
            .filter_by(Expr::raw(r#""credit_transactions"."related_key"::text"#)),
    ]
}

fn user_credit_transaction_columns() -> Vec<DatatableColumn<CreditTransactionDatatableRow>> {
    vec![
        DatatableColumn::field(CreditTransactionDatatableRow::TRANSACTION_TYPE)
            .label("admin.credit_transactions.columns.transaction_type")
            .sort_by(ColumnRef::new(TRANSACTIONS_TABLE, "transaction_type"))
            .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "transaction_type"))
            .exportable(),
        DatatableColumn::field(CreditTransactionDatatableRow::AMOUNT)
            .label("admin.credit_transactions.columns.amount")
            .sort_by(ColumnRef::new(TRANSACTIONS_TABLE, "amount"))
            .exportable(),
        DatatableColumn::field(CreditTransactionDatatableRow::CREATED_AT)
            .label("admin.credit_transactions.columns.created")
            .sort_by(ColumnRef::new(TRANSACTIONS_TABLE, "created_at"))
            .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "created_at"))
            .exportable(),
        DatatableColumn::field(CreditTransactionDatatableRow::USER_ID).filter_by(user_id_expr()),
        DatatableColumn::field(CreditTransactionDatatableRow::CREDIT_TYPE)
            .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "credit_type")),
        DatatableColumn::field(CreditTransactionDatatableRow::RELATED_TYPE)
            .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "related_type")),
        DatatableColumn::field(CreditTransactionDatatableRow::RELATED_KEY)
            .filter_by(Expr::raw(r#""credit_transactions"."related_key"::text"#)),
    ]
}

pub struct CreditTransactionDatatable;
pub struct UserCreditTransactionDatatable;

#[async_trait]
impl Datatable for CreditTransactionDatatable {
    type Row = CreditTransactionDatatableRow;
    type Query = ProjectionQuery<CreditTransactionDatatableRow>;

    const ID: &'static str = "admin.credit_transactions";

    fn query(_ctx: &DatatableContext) -> Self::Query {
        credit_transaction_query()
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        credit_transaction_columns()
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![DatatableSort::desc(
            CreditTransactionDatatableRow::CREATED_AT,
        )]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text_search_fields(
                    "search",
                    "admin.datatable.filters.search",
                    [
                        DatatableFieldRef::<Self::Row>::from(
                            CreditTransactionDatatableRow::USER_LABEL,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            CreditTransactionDatatableRow::USER_NAME,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            CreditTransactionDatatableRow::USER_USERNAME,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            CreditTransactionDatatableRow::USER_EMAIL,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            CreditTransactionDatatableRow::USER_ID,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            CreditTransactionDatatableRow::RELATED_TYPE,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            CreditTransactionDatatableRow::RELATED_KEY,
                        ),
                    ],
                )
                .placeholder("admin.credit_transactions.search_placeholder"),
                DatatableFilterField::select("credit_type", "admin.datatable.filters.credit_type")
                    .options(CreditType::options()),
            ),
            DatatableFilterRow::single(
                DatatableFilterField::select(
                    "transaction_type",
                    "admin.datatable.filters.transaction_type",
                )
                .options(CreditTransactionType::options()),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::decimal_min(
                    "amount_min",
                    "admin.datatable.filters.amount_min",
                )
                .bind(
                    CreditTransactionDatatableRow::AMOUNT.alias(),
                    DatatableFilterOp::Gte,
                    DatatableFilterValueKind::Decimal,
                )
                .placeholder("admin.credit_transactions.amount_placeholder"),
                DatatableFilterField::decimal_max(
                    "amount_max",
                    "admin.datatable.filters.amount_max",
                )
                .bind(
                    CreditTransactionDatatableRow::AMOUNT.alias(),
                    DatatableFilterOp::Lte,
                    DatatableFilterValueKind::Decimal,
                )
                .placeholder("admin.credit_transactions.amount_placeholder"),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::date_from(
                    "created_from",
                    "admin.datatable.filters.created_from",
                )
                .bind(
                    CreditTransactionDatatableRow::CREATED_AT.alias(),
                    DatatableFilterOp::DateFrom,
                    DatatableFilterValueKind::Date,
                ),
                DatatableFilterField::date_to("created_to", "admin.datatable.filters.created_to")
                    .bind(
                        CreditTransactionDatatableRow::CREATED_AT.alias(),
                        DatatableFilterOp::DateTo,
                        DatatableFilterValueKind::Date,
                    ),
            ),
        ])
    }
}

#[async_trait]
impl Datatable for UserCreditTransactionDatatable {
    type Row = CreditTransactionDatatableRow;
    type Query = ProjectionQuery<CreditTransactionDatatableRow>;

    const ID: &'static str = "admin.user_credit_transactions";

    fn query(_ctx: &DatatableContext) -> Self::Query {
        credit_transaction_query()
    }

    async fn filters(ctx: &DatatableContext, query: Self::Query) -> Result<Self::Query> {
        Ok(scoped_credit_transaction_filters(ctx, query))
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        user_credit_transaction_columns()
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![DatatableSort::desc(
            CreditTransactionDatatableRow::CREATED_AT,
        )]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text_search_fields(
                    "search",
                    "admin.datatable.filters.search",
                    [
                        DatatableFieldRef::<Self::Row>::from(
                            CreditTransactionDatatableRow::RELATED_TYPE,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            CreditTransactionDatatableRow::RELATED_KEY,
                        ),
                    ],
                )
                .placeholder("admin.credits.trace_search_placeholder"),
                DatatableFilterField::select(
                    "transaction_type",
                    "admin.datatable.filters.transaction_type",
                )
                .options(CreditTransactionType::options()),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::decimal_min(
                    "amount_min",
                    "admin.datatable.filters.amount_min",
                )
                .bind(
                    CreditTransactionDatatableRow::AMOUNT.alias(),
                    DatatableFilterOp::Gte,
                    DatatableFilterValueKind::Decimal,
                )
                .placeholder("admin.credit_transactions.amount_placeholder"),
                DatatableFilterField::decimal_max(
                    "amount_max",
                    "admin.datatable.filters.amount_max",
                )
                .bind(
                    CreditTransactionDatatableRow::AMOUNT.alias(),
                    DatatableFilterOp::Lte,
                    DatatableFilterValueKind::Decimal,
                )
                .placeholder("admin.credit_transactions.amount_placeholder"),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::date_from(
                    "created_from",
                    "admin.datatable.filters.created_from",
                )
                .bind(
                    CreditTransactionDatatableRow::CREATED_AT.alias(),
                    DatatableFilterOp::DateFrom,
                    DatatableFilterValueKind::Date,
                ),
                DatatableFilterField::date_to("created_to", "admin.datatable.filters.created_to")
                    .bind(
                        CreditTransactionDatatableRow::CREATED_AT.alias(),
                        DatatableFilterOp::DateTo,
                        DatatableFilterValueKind::Date,
                    ),
            ),
        ])
    }
}
