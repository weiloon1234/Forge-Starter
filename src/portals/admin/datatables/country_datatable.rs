use async_trait::async_trait;
use forge::prelude::*;
use forge::countries::CountryStatus;
use crate::domain::models::Country;

pub struct CountryDatatable;

#[async_trait]
impl ModelDatatable for CountryDatatable {
    type Model = Country;
    const ID: &'static str = "admin.countries";

    fn query(_ctx: &DatatableContext) -> ModelQuery<Country> {
        Country::model_query()
    }

    fn columns() -> Vec<DatatableColumn<Country>> {
        vec![
            DatatableColumn::field(Country::FLAG_EMOJI).label("").sortable(),
            DatatableColumn::field(Country::NAME).label("Country").sortable().filterable().exportable(),
            DatatableColumn::field(Country::ISO2).label("ISO2").sortable().filterable().exportable(),
            DatatableColumn::field(Country::REGION).label("Region").sortable().exportable(),
            DatatableColumn::field(Country::CALLING_CODE).label("Calling Code").sortable().exportable(),
            DatatableColumn::field(Country::PRIMARY_CURRENCY_CODE).label("Currency").sortable().filterable().exportable(),
            DatatableColumn::field(Country::CONVERSION_RATE).label("Conversion rate").sortable().exportable(),
            DatatableColumn::field(Country::STATUS).label("Status").sortable().filterable().exportable(),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Country>> {
        vec![DatatableSort::asc(Country::NAME)]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text("name|iso2|primary_currency_code", "Search").placeholder("Name, ISO2, or currency..."),
                DatatableFilterField::enum_select::<CountryStatus>("status", "Status"),
            ),
        ])
    }
}
