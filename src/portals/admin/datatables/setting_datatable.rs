use async_trait::async_trait;
use forge::datatable::column::DatatableFieldRef;
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
                .label("Key")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AppSetting::LABEL)
                .label("Label")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AppSetting::SETTING_TYPE)
                .label("Type")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AppSetting::GROUP_NAME)
                .label("Group")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AppSetting::IS_PUBLIC)
                .label("Public")
                .sortable()
                .filterable()
                .exportable(),
            DatatableColumn::field(AppSetting::VALUE)
                .label("Value")
                .exportable(),
            DatatableColumn::field(AppSetting::UPDATED_AT)
                .label("Updated")
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
        Ok(vec![
            DatatableFilterRow::pair(
                DatatableFilterField::text_search_fields(
                    "search",
                    "Search",
                    [
                        DatatableFieldRef::<Self::Row>::from(AppSetting::KEY),
                        DatatableFieldRef::<Self::Row>::from(AppSetting::LABEL),
                        DatatableFieldRef::<Self::Row>::from(AppSetting::DESCRIPTION),
                    ],
                )
                .placeholder("Key, label, or description..."),
                DatatableFilterField::select("setting_type", "Type")
                    .options(SettingType::options()),
            ),
            DatatableFilterRow::pair(
                DatatableFilterField::select("group_name", "Group").options(group_options),
                DatatableFilterField::checkbox("is_public", "Public only"),
            ),
        ])
    }
}
