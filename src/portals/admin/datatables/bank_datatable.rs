use async_trait::async_trait;
use forge::prelude::*;
use serde::Serialize;

use crate::domain::models::Bank;
use crate::support::i18n::default_locale;

const BANKS_TABLE: &str = "banks";
const BANK_NAMES_TABLE: &str = "bank_names";

#[derive(Clone, Debug, Serialize, forge::Projection)]
pub struct BankDatatableRow {
    id: ModelId<Bank>,
    country_iso2: String,
    name: String,
    created_at: DateTime,
    updated_at: DateTime,
}

fn name_expr() -> Expr {
    Sql::coalesce([
        Expr::column(ColumnRef::new(BANK_NAMES_TABLE, "value")),
        Expr::value(""),
    ])
}

pub struct BankDatatable;

#[async_trait]
impl Datatable for BankDatatable {
    type Row = BankDatatableRow;
    type Query = ProjectionQuery<BankDatatableRow>;
    const ID: &'static str = "admin.banks";

    fn query(ctx: &DatatableContext) -> Self::Query {
        let default_locale = default_locale(ctx.app);

        BankDatatableRow::source(BANKS_TABLE)
            .left_join(
                TableRef::new("model_translations").aliased(BANK_NAMES_TABLE),
                Condition::and([
                    Condition::compare(
                        Expr::column(ColumnRef::new(BANK_NAMES_TABLE, "translatable_id")),
                        ComparisonOp::Eq,
                        Expr::column(ColumnRef::new(BANKS_TABLE, "id")),
                    ),
                    Condition::compare(
                        Expr::column(ColumnRef::new(BANK_NAMES_TABLE, "translatable_type")),
                        ComparisonOp::Eq,
                        Expr::value(Bank::translatable_type()),
                    ),
                    Condition::compare(
                        Expr::column(ColumnRef::new(BANK_NAMES_TABLE, "field")),
                        ComparisonOp::Eq,
                        Expr::value("name"),
                    ),
                    Condition::compare(
                        Expr::column(ColumnRef::new(BANK_NAMES_TABLE, "locale")),
                        ComparisonOp::Eq,
                        Expr::value(default_locale),
                    ),
                ]),
            )
            .select_field(BankDatatableRow::ID, ColumnRef::new(BANKS_TABLE, "id"))
            .select_field(
                BankDatatableRow::COUNTRY_ISO2,
                ColumnRef::new(BANKS_TABLE, "country_iso2"),
            )
            .select_field(BankDatatableRow::NAME, name_expr())
            .select_field(
                BankDatatableRow::CREATED_AT,
                ColumnRef::new(BANKS_TABLE, "created_at"),
            )
            .select_field(
                BankDatatableRow::UPDATED_AT,
                ColumnRef::new(BANKS_TABLE, "updated_at"),
            )
            .where_(Condition::IsNull(ColumnRef::new(BANKS_TABLE, "deleted_at")))
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(BankDatatableRow::ID),
            DatatableColumn::field(BankDatatableRow::COUNTRY_ISO2)
                .label("Country")
                .sortable()
                .filter_by(ColumnRef::new(BANKS_TABLE, "country_iso2"))
                .exportable(),
            DatatableColumn::field(BankDatatableRow::NAME)
                .label("Name")
                .sort_by(name_expr())
                .filter_by(name_expr())
                .exportable(),
            DatatableColumn::field(BankDatatableRow::CREATED_AT)
                .label("Created")
                .sortable()
                .exportable(),
            DatatableColumn::field(BankDatatableRow::UPDATED_AT)
                .label("Updated")
                .sortable()
                .exportable(),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![
            DatatableSort::asc(BankDatatableRow::COUNTRY_ISO2),
            DatatableSort::asc(BankDatatableRow::NAME),
        ]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![DatatableFilterRow::single(
            DatatableFilterField::text_search_fields(
                "search",
                "Search",
                [BankDatatableRow::NAME, BankDatatableRow::COUNTRY_ISO2],
            )
            .placeholder("Search bank name or country..."),
        )])
    }
}
