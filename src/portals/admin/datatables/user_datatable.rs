use crate::domain::models::User;
use async_trait::async_trait;
use forge::prelude::*;

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
            DatatableColumn::field(User::USERNAME)
                .label("Username")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(User::EMAIL)
                .label("Email")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(User::NAME)
                .label("Name")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(User::COUNTRY_ISO2)
                .label("Country")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(User::CONTACT_COUNTRY_ISO2)
                .label("Contact Country")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(User::CONTACT_NUMBER)
                .label("Contact Number")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(User::CREATED_AT)
                .label("Created")
                .sortable()
                .filterable()
                .exportable(),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<User>> {
        vec![DatatableSort::desc(User::CREATED_AT)]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text("username|email|name", "Search")
                    .placeholder("Search username, email, or name..."),
                DatatableFilterField::text("contact_number", "Contact number")
                    .placeholder("Search contact number..."),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::text("country_iso2", "Country")
                    .placeholder("Search country ISO2..."),
                DatatableFilterField::text("contact_country_iso2", "Contact country")
                    .placeholder("Search contact country ISO2..."),
            ),
        ])
    }
}
