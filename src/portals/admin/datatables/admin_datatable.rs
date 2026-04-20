use async_trait::async_trait;
use forge::prelude::*;

use crate::domain::models::Admin;
use crate::domain::services::admin_service;

pub struct AdminDatatable;

#[async_trait]
impl Datatable for AdminDatatable {
    type Row = Admin;
    type Query = ModelQuery<Admin>;
    const ID: &'static str = "admin.admins";

    fn query(_ctx: &DatatableContext) -> Self::Query {
        Admin::model_query()
    }

    async fn filters(ctx: &DatatableContext, query: Self::Query) -> Result<Self::Query> {
        let Some(actor) = ctx.actor else {
            return Ok(query.where_(Admin::ID.is_null()));
        };
        let Some(admin) = actor.resolve::<Admin>(ctx.app).await? else {
            return Ok(query.where_(Admin::ID.is_null()));
        };

        Ok(admin_service::scope_visible_admins(query, &admin))
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(Admin::USERNAME)
                .label("Username")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(Admin::NAME)
                .label("Name")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(Admin::EMAIL)
                .label("Email")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(Admin::ADMIN_TYPE)
                .label("Admin Type")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(Admin::CREATED_AT)
                .label("Created")
                .sortable()
                .filterable()
                .exportable(),
        ]
    }

    fn mappings() -> Vec<DatatableMapping<Self::Row>> {
        vec![
            DatatableMapping::new("id", |admin: &Admin, _ctx| {
                DatatableValue::string(admin.id.to_string())
            }),
            DatatableMapping::new("permission_count", |admin: &Admin, _ctx| {
                DatatableValue::number(admin_service::permission_module_count(admin) as u64)
            }),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![DatatableSort::desc(Admin::CREATED_AT)]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text_like("username", "Username")
                    .placeholder("Search username..."),
                DatatableFilterField::text_search_fields(
                    "search",
                    "Search",
                    [Admin::NAME, Admin::EMAIL],
                )
                .placeholder("Name or email..."),
            ),
            DatatableFilterRow::single(
                DatatableFilterField::select("admin_type", "Admin Type")
                    .options(crate::domain::enums::AdminType::options()),
            ),
        ])
    }
}
