use async_trait::async_trait;
use forge::datatable::column::DatatableFieldRef;
use forge::prelude::*;
use serde::Serialize;

use crate::domain::enums::{CreditTransactionType, CreditType};

const ADJUSTMENTS_TABLE: &str = "admin_credit_adjustments";
const TRANSACTIONS_TABLE: &str = "credit_transactions";
const USERS_TABLE: &str = "users";
const ADMINS_TABLE: &str = "admins";

#[derive(Clone, Debug, Serialize, forge::Projection)]
pub struct CreditAdjustmentDatatableRow {
    id: String,
    credit_transaction_id: String,
    user_id: String,
    user_label: String,
    credit_type: String,
    transaction_type: String,
    amount: Numeric,
    admin_id: String,
    admin_label: String,
    remark: Option<String>,
    related_key: Option<String>,
    related_type: Option<String>,
    created_at: DateTime,
}

fn user_label_expr() -> Expr {
    Sql::coalesce([
        Expr::column(ColumnRef::new(USERS_TABLE, "name")),
        Expr::column(ColumnRef::new(USERS_TABLE, "username")),
        Expr::column(ColumnRef::new(USERS_TABLE, "email")),
        Expr::raw(r#""users"."id"::text"#),
    ])
}

fn admin_label_expr() -> Expr {
    Sql::coalesce([
        Expr::column(ColumnRef::new(ADMINS_TABLE, "name")),
        Expr::column(ColumnRef::new(ADMINS_TABLE, "username")),
        Expr::column(ColumnRef::new(ADMINS_TABLE, "email")),
        Expr::raw(r#""admins"."id"::text"#),
    ])
}

pub struct CreditAdjustmentDatatable;

#[async_trait]
impl Datatable for CreditAdjustmentDatatable {
    type Row = CreditAdjustmentDatatableRow;
    type Query = ProjectionQuery<CreditAdjustmentDatatableRow>;

    const ID: &'static str = "admin.credit_adjustments";

    fn query(_ctx: &DatatableContext) -> Self::Query {
        CreditAdjustmentDatatableRow::source(ADJUSTMENTS_TABLE)
            .join(
                JoinKind::Inner,
                TableRef::new(TRANSACTIONS_TABLE),
                Condition::compare(
                    Expr::column(ColumnRef::new(ADJUSTMENTS_TABLE, "credit_transaction_id")),
                    ComparisonOp::Eq,
                    Expr::column(ColumnRef::new(TRANSACTIONS_TABLE, "id")),
                ),
            )
            .join(
                JoinKind::Inner,
                TableRef::new(USERS_TABLE),
                Condition::compare(
                    Expr::column(ColumnRef::new(TRANSACTIONS_TABLE, "user_id")),
                    ComparisonOp::Eq,
                    Expr::column(ColumnRef::new(USERS_TABLE, "id")),
                ),
            )
            .join(
                JoinKind::Inner,
                TableRef::new(ADMINS_TABLE),
                Condition::compare(
                    Expr::column(ColumnRef::new(ADJUSTMENTS_TABLE, "admin_id")),
                    ComparisonOp::Eq,
                    Expr::column(ColumnRef::new(ADMINS_TABLE, "id")),
                ),
            )
            .select_field(
                CreditAdjustmentDatatableRow::ID,
                Expr::raw(r#""admin_credit_adjustments"."id"::text"#),
            )
            .select_field(
                CreditAdjustmentDatatableRow::CREDIT_TRANSACTION_ID,
                Expr::raw(r#""credit_transactions"."id"::text"#),
            )
            .select_field(
                CreditAdjustmentDatatableRow::USER_ID,
                Expr::raw(r#""credit_transactions"."user_id"::text"#),
            )
            .select_field(CreditAdjustmentDatatableRow::USER_LABEL, user_label_expr())
            .select_field(
                CreditAdjustmentDatatableRow::CREDIT_TYPE,
                ColumnRef::new(TRANSACTIONS_TABLE, "credit_type"),
            )
            .select_field(
                CreditAdjustmentDatatableRow::TRANSACTION_TYPE,
                ColumnRef::new(TRANSACTIONS_TABLE, "transaction_type"),
            )
            .select_field(
                CreditAdjustmentDatatableRow::AMOUNT,
                ColumnRef::new(TRANSACTIONS_TABLE, "amount"),
            )
            .select_field(
                CreditAdjustmentDatatableRow::ADMIN_ID,
                Expr::raw(r#""admin_credit_adjustments"."admin_id"::text"#),
            )
            .select_field(
                CreditAdjustmentDatatableRow::ADMIN_LABEL,
                admin_label_expr(),
            )
            .select_field(
                CreditAdjustmentDatatableRow::REMARK,
                ColumnRef::new(ADJUSTMENTS_TABLE, "remark"),
            )
            .select_field(
                CreditAdjustmentDatatableRow::RELATED_KEY,
                Expr::raw(r#""credit_transactions"."related_key"::text"#),
            )
            .select_field(
                CreditAdjustmentDatatableRow::RELATED_TYPE,
                ColumnRef::new(TRANSACTIONS_TABLE, "related_type"),
            )
            .select_field(
                CreditAdjustmentDatatableRow::CREATED_AT,
                ColumnRef::new(ADJUSTMENTS_TABLE, "created_at"),
            )
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(CreditAdjustmentDatatableRow::USER_LABEL)
                .label("User")
                .sortable()
                .filter_by(user_label_expr())
                .exportable(),
            DatatableColumn::field(CreditAdjustmentDatatableRow::CREDIT_TYPE)
                .label("Credit type")
                .sortable()
                .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "credit_type"))
                .exportable(),
            DatatableColumn::field(CreditAdjustmentDatatableRow::AMOUNT)
                .label("Amount")
                .sortable()
                .exportable(),
            DatatableColumn::field(CreditAdjustmentDatatableRow::ADMIN_LABEL)
                .label("Admin")
                .sortable()
                .filter_by(admin_label_expr())
                .exportable(),
            DatatableColumn::field(CreditAdjustmentDatatableRow::TRANSACTION_TYPE)
                .label("Transaction type")
                .sortable()
                .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "transaction_type"))
                .exportable(),
            DatatableColumn::field(CreditAdjustmentDatatableRow::REMARK)
                .label("Remark")
                .filter_by(ColumnRef::new(ADJUSTMENTS_TABLE, "remark"))
                .exportable(),
            DatatableColumn::field(CreditAdjustmentDatatableRow::CREATED_AT)
                .label("Created")
                .sortable()
                .filter_by(ColumnRef::new(ADJUSTMENTS_TABLE, "created_at"))
                .exportable(),
            DatatableColumn::field(CreditAdjustmentDatatableRow::RELATED_TYPE)
                .filter_by(ColumnRef::new(TRANSACTIONS_TABLE, "related_type")),
            DatatableColumn::field(CreditAdjustmentDatatableRow::RELATED_KEY)
                .filter_by(Expr::raw(r#""credit_transactions"."related_key"::text"#)),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![DatatableSort::desc(
            CreditAdjustmentDatatableRow::CREATED_AT,
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
                            CreditAdjustmentDatatableRow::USER_LABEL,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            CreditAdjustmentDatatableRow::ADMIN_LABEL,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            CreditAdjustmentDatatableRow::TRANSACTION_TYPE,
                        ),
                        DatatableFieldRef::<Self::Row>::from(CreditAdjustmentDatatableRow::REMARK),
                        DatatableFieldRef::<Self::Row>::from(
                            CreditAdjustmentDatatableRow::RELATED_TYPE,
                        ),
                        DatatableFieldRef::<Self::Row>::from(
                            CreditAdjustmentDatatableRow::RELATED_KEY,
                        ),
                    ],
                )
                .placeholder("User, admin, type, remark, or trace..."),
                DatatableFilterField::select("credit_type", "Credit type")
                    .options(CreditType::options()),
            ),
            DatatableFilterRow::single(
                DatatableFilterField::select("transaction_type", "Transaction type")
                    .options(CreditTransactionType::options()),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::date_from("created_from", "Created at (From)").bind(
                    CreditAdjustmentDatatableRow::CREATED_AT.alias(),
                    DatatableFilterOp::DateFrom,
                    DatatableFilterValueKind::Date,
                ),
                DatatableFilterField::date_to("created_to", "Created at (To)").bind(
                    CreditAdjustmentDatatableRow::CREATED_AT.alias(),
                    DatatableFilterOp::DateTo,
                    DatatableFilterValueKind::Date,
                ),
            ),
        ])
    }
}
