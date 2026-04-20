use async_trait::async_trait;
use forge::datatable::column::DatatableFieldRef;
use forge::prelude::*;
use serde::Serialize;
use serde_json::Value;

use crate::domain::enums::{CreditTransactionType, CreditType};
use crate::domain::services::credit_service;

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
    balance_after: Numeric,
    explanation_key: String,
    explanation_params_json: String,
    explanation_overrides_json: String,
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

pub struct CreditTransactionDatatable;

#[async_trait]
impl Datatable for CreditTransactionDatatable {
    type Row = CreditTransactionDatatableRow;
    type Query = ProjectionQuery<CreditTransactionDatatableRow>;

    const ID: &'static str = "admin.credit_transactions";

    fn query(_ctx: &DatatableContext) -> Self::Query {
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
                CreditTransactionDatatableRow::BALANCE_AFTER,
                ColumnRef::new(TRANSACTIONS_TABLE, "balance_after"),
            )
            .select_field(
                CreditTransactionDatatableRow::EXPLANATION_KEY,
                ColumnRef::new(TRANSACTIONS_TABLE, "explanation_key"),
            )
            .select_field(
                CreditTransactionDatatableRow::EXPLANATION_PARAMS_JSON,
                Expr::raw(r#""credit_transactions"."explanation_params"::text"#),
            )
            .select_field(
                CreditTransactionDatatableRow::EXPLANATION_OVERRIDES_JSON,
                Expr::raw(r#""credit_transactions"."explanation_overrides"::text"#),
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

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(CreditTransactionDatatableRow::CREATED_AT)
                .label("admin.credit_transactions.columns.created")
                .sort_by(ColumnRef::new(TRANSACTIONS_TABLE, "created_at"))
                .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "created_at"))
                .exportable(),
            DatatableColumn::field(CreditTransactionDatatableRow::USER_LABEL)
                .label("admin.credit_transactions.columns.user")
                .sort_by(user_label_expr())
                .filter_by(user_label_expr())
                .exportable(),
            DatatableColumn::field(CreditTransactionDatatableRow::CREDIT_TYPE)
                .label("admin.credit_transactions.columns.credit_type")
                .sort_by(ColumnRef::new(TRANSACTIONS_TABLE, "credit_type"))
                .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "credit_type"))
                .exportable(),
            DatatableColumn::field(CreditTransactionDatatableRow::AMOUNT)
                .label("admin.credit_transactions.columns.amount")
                .sort_by(ColumnRef::new(TRANSACTIONS_TABLE, "amount"))
                .exportable(),
            DatatableColumn::field(CreditTransactionDatatableRow::EXPLANATION_KEY)
                .label("admin.credit_transactions.columns.explanation")
                .exportable(),
            DatatableColumn::field(CreditTransactionDatatableRow::TRANSACTION_TYPE)
                .label("admin.credit_transactions.columns.transaction_type")
                .sort_by(ColumnRef::new(TRANSACTIONS_TABLE, "transaction_type"))
                .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "transaction_type"))
                .exportable(),
            DatatableColumn::field(CreditTransactionDatatableRow::BALANCE_AFTER)
                .label("admin.credit_transactions.columns.balance_after")
                .sort_by(ColumnRef::new(TRANSACTIONS_TABLE, "balance_after"))
                .exportable(),
            DatatableColumn::field(CreditTransactionDatatableRow::USER_NAME)
                .filter_by(ColumnRef::new(USERS_TABLE, "name")),
            DatatableColumn::field(CreditTransactionDatatableRow::USER_USERNAME)
                .filter_by(ColumnRef::new(USERS_TABLE, "username")),
            DatatableColumn::field(CreditTransactionDatatableRow::USER_EMAIL)
                .filter_by(ColumnRef::new(USERS_TABLE, "email")),
            DatatableColumn::field(CreditTransactionDatatableRow::USER_ID)
                .filter_by(user_id_expr()),
            DatatableColumn::field(CreditTransactionDatatableRow::RELATED_TYPE)
                .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "related_type")),
            DatatableColumn::field(CreditTransactionDatatableRow::RELATED_KEY)
                .filter_by(Expr::raw(r#""credit_transactions"."related_key"::text"#)),
        ]
    }

    fn mappings() -> Vec<DatatableMapping<Self::Row>> {
        vec![
            DatatableMapping::new(
                "explanation_key",
                |row: &CreditTransactionDatatableRow, ctx| {
                    DatatableValue::string(explanation_text(row, ctx))
                },
            ),
            DatatableMapping::new(
                "explanation_text",
                |row: &CreditTransactionDatatableRow, ctx| {
                    DatatableValue::string(explanation_text(row, ctx))
                },
            ),
        ]
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
                    "Search",
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
                DatatableFilterField::select(
                    "credit_type",
                    "admin.credit_transactions.columns.credit_type",
                )
                .options(CreditType::options()),
            ),
            DatatableFilterRow::single(
                DatatableFilterField::select(
                    "transaction_type",
                    "admin.credit_transactions.columns.transaction_type",
                )
                .options(CreditTransactionType::options()),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::decimal_min(
                    "amount_min",
                    "admin.credit_transactions.filters.amount_min",
                )
                .bind(
                    CreditTransactionDatatableRow::AMOUNT.alias(),
                    DatatableFilterOp::Gte,
                    DatatableFilterValueKind::Decimal,
                )
                .placeholder("admin.credit_transactions.amount_placeholder"),
                DatatableFilterField::decimal_max(
                    "amount_max",
                    "admin.credit_transactions.filters.amount_max",
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
                    "admin.credit_transactions.filters.created_from",
                )
                .bind(
                    CreditTransactionDatatableRow::CREATED_AT.alias(),
                    DatatableFilterOp::DateFrom,
                    DatatableFilterValueKind::Date,
                ),
                DatatableFilterField::date_to(
                    "created_to",
                    "admin.credit_transactions.filters.created_to",
                )
                .bind(
                    CreditTransactionDatatableRow::CREATED_AT.alias(),
                    DatatableFilterOp::DateTo,
                    DatatableFilterValueKind::Date,
                ),
            ),
        ])
    }
}

fn parse_json_text(value: &str) -> Value {
    serde_json::from_str(value).unwrap_or_else(|_| Value::Object(Default::default()))
}

fn explanation_text(row: &CreditTransactionDatatableRow, ctx: &DatatableContext) -> String {
    let locale = ctx.locale.unwrap_or("en");
    let explanation_params = parse_json_text(&row.explanation_params_json);
    let explanation_overrides = parse_json_text(&row.explanation_overrides_json);

    credit_service::render_explanation(
        ctx.app,
        locale,
        &row.explanation_key,
        &explanation_params,
        &explanation_overrides,
    )
}
