use forge::prelude::*;

pub mod admin_datatable;
pub mod country_datatable;
pub mod credit_adjustment_datatable;
pub mod credit_transaction_datatable;
pub mod page_datatable;
pub mod runner;
pub mod setting_datatable;
pub mod user_datatable;

pub use admin_datatable::AdminDatatable;
pub use country_datatable::CountryDatatable;
pub use credit_adjustment_datatable::CreditAdjustmentDatatable;
pub use credit_transaction_datatable::CreditTransactionDatatable;
pub use page_datatable::PageDatatable;
pub use setting_datatable::SettingDatatable;
pub use user_datatable::UserDatatable;

pub fn register_all(registrar: &mut ServiceRegistrar) -> Result<()> {
    registrar.register_datatable::<AdminDatatable>()?;
    registrar.register_datatable::<UserDatatable>()?;
    registrar.register_datatable::<CountryDatatable>()?;
    registrar.register_datatable::<SettingDatatable>()?;
    registrar.register_datatable::<PageDatatable>()?;
    registrar.register_datatable::<CreditAdjustmentDatatable>()?;
    registrar.register_datatable::<CreditTransactionDatatable>()?;
    Ok(())
}

pub async fn run_json(
    id: &str,
    app: &AppContext,
    actor: Option<&Actor>,
    request: DatatableRequest,
    locale: Option<&str>,
    timezone: Timezone,
) -> Option<Result<DatatableJsonResponse>> {
    Some(match id {
        AdminDatatable::ID => {
            runner::build_json_response::<AdminDatatable>(app, actor, request, locale, timezone)
                .await
        }
        UserDatatable::ID => {
            runner::build_json_response::<UserDatatable>(app, actor, request, locale, timezone)
                .await
        }
        CountryDatatable::ID => {
            runner::build_json_response::<CountryDatatable>(app, actor, request, locale, timezone)
                .await
        }
        SettingDatatable::ID => {
            runner::build_json_response::<SettingDatatable>(app, actor, request, locale, timezone)
                .await
        }
        PageDatatable::ID => {
            runner::build_json_response::<PageDatatable>(app, actor, request, locale, timezone)
                .await
        }
        CreditAdjustmentDatatable::ID => {
            runner::build_json_response::<CreditAdjustmentDatatable>(
                app, actor, request, locale, timezone,
            )
            .await
        }
        CreditTransactionDatatable::ID => {
            runner::build_json_response::<CreditTransactionDatatable>(
                app, actor, request, locale, timezone,
            )
            .await
        }
        _ => return None,
    })
}

pub async fn run_download(
    id: &str,
    app: &AppContext,
    actor: Option<&Actor>,
    request: DatatableRequest,
    locale: Option<&str>,
    timezone: Timezone,
) -> Option<Result<Response>> {
    Some(match id {
        AdminDatatable::ID => {
            runner::build_download_response::<AdminDatatable>(app, actor, request, locale, timezone)
                .await
        }
        UserDatatable::ID => {
            runner::build_download_response::<UserDatatable>(app, actor, request, locale, timezone)
                .await
        }
        CountryDatatable::ID => {
            runner::build_download_response::<CountryDatatable>(
                app, actor, request, locale, timezone,
            )
            .await
        }
        SettingDatatable::ID => {
            runner::build_download_response::<SettingDatatable>(
                app, actor, request, locale, timezone,
            )
            .await
        }
        PageDatatable::ID => {
            runner::build_download_response::<PageDatatable>(app, actor, request, locale, timezone)
                .await
        }
        CreditAdjustmentDatatable::ID => {
            runner::build_download_response::<CreditAdjustmentDatatable>(
                app, actor, request, locale, timezone,
            )
            .await
        }
        CreditTransactionDatatable::ID => {
            runner::build_download_response::<CreditTransactionDatatable>(
                app, actor, request, locale, timezone,
            )
            .await
        }
        _ => return None,
    })
}
