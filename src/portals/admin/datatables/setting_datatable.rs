use async_trait::async_trait;
use forge::prelude::*;
use forge::settings::{Setting, SettingType};

use crate::domain::models::AppSetting;

pub struct SettingDatatable;

#[async_trait]
impl Datatable for SettingDatatable {
    type Row = AppSetting;
    type Query = ModelQuery<AppSetting>;
    const ID: &'static str = "admin.settings";

    fn query(_ctx: &DatatableContext) -> Self::Query {
        AppSetting::model_query()
    }

    fn columns() -> Vec<DatatableColumn<Self::Row>> {
        vec![
            DatatableColumn::field(AppSetting::KEY)
                .label("admin.settings.columns.key")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AppSetting::LABEL)
                .label("admin.settings.columns.label")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AppSetting::SETTING_TYPE)
                .label("admin.settings.columns.type")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AppSetting::GROUP_NAME)
                .label("admin.settings.columns.group")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AppSetting::IS_PUBLIC)
                .label("admin.settings.columns.public")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AppSetting::VALUE)
                .label("admin.settings.columns.value")
                .exportable(),
            DatatableColumn::field(AppSetting::UPDATED_AT)
                .label("admin.settings.columns.updated")
                .sortable()
                .exportable(),
        ]
    }

    fn default_sort() -> Vec<DatatableSort<Self::Row>> {
        vec![
            DatatableSort::asc(AppSetting::GROUP_NAME),
            DatatableSort::asc(AppSetting::SORT_ORDER),
            DatatableSort::asc(AppSetting::KEY),
        ]
    }

    async fn available_filters(_ctx: &DatatableContext) -> Result<Vec<DatatableFilterRow>> {
        let groups = Setting::groups(_ctx.app).await?;
        let group_options = groups
            .into_iter()
            .map(|group| DatatableFilterOption::new(group.clone(), group))
            .collect::<Vec<_>>();
        let type_options = SettingType::all()
            .iter()
            .map(|(key, _)| {
                DatatableFilterOption::new((*key).to_string(), format!("setting_type.{key}"))
            })
            .collect::<Vec<_>>();

        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text_search("search", "Search")
                    .server_field("key|label|description")
                    .placeholder("admin.settings.search_placeholder"),
                DatatableFilterField::select("setting_type", "admin.settings.columns.type")
                    .options(type_options),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::select("group_name", "admin.settings.columns.group")
                    .options(group_options),
                DatatableFilterField::checkbox("is_public", "admin.settings.filters.public_only"),
            ),
        ])
    }
}
