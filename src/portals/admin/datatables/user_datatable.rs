use async_trait::async_trait;
use forge::prelude::*;
use crate::domain::models::User;

pub struct UserDatatable;

#[async_trait]
impl ModelDatatable for UserDatatable {
    type Model = User;
    const ID: &'static str = "admin.users";

    fn query(_ctx: &DatatableContext) -> ModelQuery<User> {
        User::model_query()
    }

    fn columns() -> Vec<DatatableColumn<User>> {
        vec![
            DatatableColumn::field(User::ID).label("ID").sortable(),
            DatatableColumn::field(User::EMAIL).label("Email").sortable().filterable().exportable(),
            DatatableColumn::field(User::NAME).label("Name").sortable().filterable().exportable(),
            DatatableColumn::field(User::STATUS).label("Status").sortable().filterable().exportable(),
            DatatableColumn::field(User::CREATED_AT).label("Created").sortable().filterable().exportable(),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<User>> {
        vec![DatatableSort::desc(User::CREATED_AT)]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text("email", "Email").placeholder("Search email..."),
                DatatableFilterField::text("name", "Name").placeholder("Search name..."),
            ),
            DatatableFilterRow::single(
                DatatableFilterField::select("status", "Status").options(vec![
                    DatatableFilterOption::new("Active", "Active"),
                    DatatableFilterOption::new("Inactive", "Inactive"),
                    DatatableFilterOption::new("Suspended", "Suspended"),
                ]),
            ),
        ])
    }
}
