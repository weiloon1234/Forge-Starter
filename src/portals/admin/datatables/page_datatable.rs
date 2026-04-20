use async_trait::async_trait;
use forge::prelude::*;
use serde::Serialize;

use crate::domain::models::Page;

const PAGES_TABLE: &str = "pages";
const PAGE_TITLES_TABLE: &str = "page_titles";

#[derive(Clone, Debug, Serialize, forge::Projection)]
pub struct PageDatatableRow {
    id: ModelId<Page>,
    slug: String,
    title: String,
    is_system: bool,
    updated_at: Option<DateTime>,
}

fn page_title_expr() -> Expr {
    Sql::coalesce([
        Expr::column(ColumnRef::new(PAGE_TITLES_TABLE, "value")),
        Expr::column(ColumnRef::new(PAGES_TABLE, "slug")),
    ])
}

pub struct PageDatatable;

#[async_trait]
impl Datatable for PageDatatable {
    type Row = PageDatatableRow;
    type Query = ProjectionQuery<PageDatatableRow>;
    const ID: &'static str = "admin.pages";

    fn query(ctx: &DatatableContext) -> Self::Query {
        let default_locale = ctx
            .app
            .i18n()
            .map(|manager| manager.default_locale().to_string())
            .unwrap_or_else(|_| "en".to_string());

        PageDatatableRow::source(PAGES_TABLE)
            .left_join(
                TableRef::new("model_translations").aliased(PAGE_TITLES_TABLE),
                Condition::and([
                    Condition::compare(
                        Expr::column(ColumnRef::new(PAGE_TITLES_TABLE, "translatable_id")),
                        ComparisonOp::Eq,
                        Expr::column(ColumnRef::new(PAGES_TABLE, "id")),
                    ),
                    Condition::compare(
                        Expr::column(ColumnRef::new(PAGE_TITLES_TABLE, "translatable_type")),
                        ComparisonOp::Eq,
                        Expr::value(Page::translatable_type()),
                    ),
                    Condition::compare(
                        Expr::column(ColumnRef::new(PAGE_TITLES_TABLE, "field")),
                        ComparisonOp::Eq,
                        Expr::value("title"),
                    ),
                    Condition::compare(
                        Expr::column(ColumnRef::new(PAGE_TITLES_TABLE, "locale")),
                        ComparisonOp::Eq,
                        Expr::value(default_locale),
                    ),
                ]),
            )
            .select_field(PageDatatableRow::ID, ColumnRef::new(PAGES_TABLE, "id"))
            .select_field(PageDatatableRow::SLUG, ColumnRef::new(PAGES_TABLE, "slug"))
            .select_field(PageDatatableRow::TITLE, page_title_expr())
            .select_field(
                PageDatatableRow::IS_SYSTEM,
                ColumnRef::new(PAGES_TABLE, "is_system"),
            )
            .select_field(
                PageDatatableRow::UPDATED_AT,
                ColumnRef::new(PAGES_TABLE, "updated_at"),
            )
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(PageDatatableRow::ID)
                .label("ID")
                .sortable()
                .exportable(),
            DatatableColumn::field(PageDatatableRow::SLUG)
                .label("admin.pages.columns.slug")
                .sortable()
                .filter_by(ColumnRef::new(PAGES_TABLE, "slug"))
                .exportable(),
            DatatableColumn::field(PageDatatableRow::TITLE)
                .label("admin.pages.columns.title")
                .sortable()
                .filter_by(page_title_expr())
                .exportable(),
            DatatableColumn::field(PageDatatableRow::IS_SYSTEM)
                .label("admin.pages.columns.system")
                .sortable()
                .filter_by(ColumnRef::new(PAGES_TABLE, "is_system"))
                .exportable(),
            DatatableColumn::field(PageDatatableRow::UPDATED_AT)
                .label("admin.pages.columns.updated")
                .sortable()
                .exportable(),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![DatatableSort::asc(PageDatatableRow::SLUG)]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![DatatableFilterRow::pair(
            DatatableFilterField::text_search_fields(
                "search",
                "Search",
                [PageDatatableRow::SLUG, PageDatatableRow::TITLE],
            )
            .placeholder("admin.pages.search_placeholder"),
            DatatableFilterField::checkbox("is_system", "admin.pages.filters.system_only"),
        )])
    }
}
