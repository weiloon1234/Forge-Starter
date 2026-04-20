use crate::domain::models::Country;
use async_trait::async_trait;
use forge::countries::CountryStatus;
use forge::datatable::column::DatatableFieldRef;
use forge::prelude::*;

pub struct CountryDatatable;

#[async_trait]
impl Datatable for CountryDatatable {
    type Row = Country;
    type Query = ModelQuery<Country>;
    const ID: &'static str = "admin.countries";

    fn query(_ctx: &DatatableContext) -> Self::Query {
        Country::model_query()
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(Country::FLAG_EMOJI)
                .label("")
                .sortable(),
            DatatableColumn::field(Country::NAME)
                .label("Country")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(Country::ISO2)
                .label("ISO2")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(Country::REGION)
                .label("Region")
                .sortable()
                .exportable(),
            DatatableColumn::field(Country::CALLING_CODE)
                .label("Calling Code")
                .sortable()
                .exportable(),
            DatatableColumn::field(Country::PRIMARY_CURRENCY_CODE)
                .label("Currency")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(Country::CONVERSION_RATE)
                .label("Conversion rate")
                .sortable()
                .exportable(),
            DatatableColumn::field(Country::IS_DEFAULT)
                .label("Default")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(Country::STATUS)
                .label("Status")
                .sortable()
                .filterable()
                .exportable(),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![DatatableSort::asc(Country::NAME)]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text_search_fields(
                    "search",
                    "Search",
                    [
                        DatatableFieldRef::<Self::Row>::from(Country::NAME),
                        DatatableFieldRef::<Self::Row>::from(Country::ISO2),
                        DatatableFieldRef::<Self::Row>::from(Country::PRIMARY_CURRENCY_CODE),
                    ],
                )
                .placeholder("Name, ISO2, or currency..."),
                DatatableFilterField::select("status", "Status").options(CountryStatus::options()),
            ),
            DatatableFilterRow::single(DatatableFilterField::checkbox(
                "is_default",
                "Default only",
            )),
        ])
    }
}
