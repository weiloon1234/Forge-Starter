use forge::prelude::*;

use crate::ids::permissions::Permission;

pub mod admin_datatable;
pub mod audit_log_datatable;
pub mod country_datatable;
pub mod credit_adjustment_datatable;
pub mod credit_transaction_datatable;
pub mod introducer_change_datatable;
pub mod page_datatable;
pub mod runner;
pub mod setting_datatable;
pub mod user_datatable;

pub use admin_datatable::AdminDatatable;
pub use audit_log_datatable::AuditLogDatatable;
pub use country_datatable::CountryDatatable;
pub use credit_adjustment_datatable::CreditAdjustmentDatatable;
pub use credit_transaction_datatable::{
    CreditTransactionDatatable, UserCreditTransactionDatatable,
};
pub use introducer_change_datatable::IntroducerChangeDatatable;
pub use page_datatable::PageDatatable;
pub use setting_datatable::SettingDatatable;
pub use user_datatable::UserDatatable;

macro_rules! admin_datatables {
    ($macro:ident $(, $context:tt)?) => {
        $macro!(
            $( $context, )?
            (AdminDatatable, Permission::AdminsRead),
            (UserDatatable, Permission::UsersRead),
            (CountryDatatable, Permission::CountriesRead),
            (SettingDatatable, Permission::SettingsRead),
            (PageDatatable, Permission::PagesRead),
            (CreditAdjustmentDatatable, Permission::CreditsRead),
            (CreditTransactionDatatable, Permission::CreditTransactionsRead),
            (
                UserCreditTransactionDatatable,
                Permission::CreditTransactionsRead
            ),
            (
                IntroducerChangeDatatable,
                Permission::IntroducerChangesRead
            ),
            (AuditLogDatatable, Permission::AuditLogsRead),
        )
    };
}

macro_rules! register_all_datatables {
    ($registrar:ident, $(($datatable:ident, $permission:expr)),* $(,)?) => {{
        $($registrar.register_datatable::<$datatable>()?;)*
        Ok(())
    }};
}

macro_rules! match_json_datatable {
    (($id:ident, $app:ident, $actor:ident, $request:ident, $locale:ident, $timezone:ident), $(($datatable:ident, $permission:expr)),* $(,)?) => {{
        Some(match $id {
            $(
                $datatable::ID => {
                    runner::build_json_response::<$datatable>(
                        $app,
                        $actor,
                        $request,
                        $locale,
                        $timezone,
                    )
                        .await
                }
            )*
            _ => return None,
        })
    }};
}

macro_rules! match_download_datatable {
    (($id:ident, $app:ident, $actor:ident, $request:ident, $locale:ident, $timezone:ident), $(($datatable:ident, $permission:expr)),* $(,)?) => {{
        Some(match $id {
            $(
                $datatable::ID => {
                    runner::build_download_response::<$datatable>(
                        $app,
                        $actor,
                        $request,
                        $locale,
                        $timezone,
                    )
                    .await
                }
            )*
            _ => return None,
        })
    }};
}

macro_rules! match_minimum_permission {
    ($id:ident, $(($datatable:ident, $permission:expr)),* $(,)?) => {{
        match $id {
            $(
                $datatable::ID => Some($permission),
            )*
            _ => None,
        }
    }};
}

pub fn register_all(registrar: &mut ServiceRegistrar) -> Result<()> {
    admin_datatables!(register_all_datatables, registrar)
}

pub fn minimum_read_permission(id: &str) -> Option<Permission> {
    admin_datatables!(match_minimum_permission, id)
}

pub async fn run_json(
    id: &str,
    app: &AppContext,
    actor: Option<&Actor>,
    request: DatatableRequest,
    locale: Option<&str>,
    timezone: Timezone,
) -> Option<Result<DatatableJsonResponse>> {
    admin_datatables!(
        match_json_datatable,
        (id, app, actor, request, locale, timezone)
    )
}

pub async fn run_download(
    id: &str,
    app: &AppContext,
    actor: Option<&Actor>,
    request: DatatableRequest,
    locale: Option<&str>,
    timezone: Timezone,
) -> Option<Result<Response>> {
    admin_datatables!(
        match_download_datatable,
        (id, app, actor, request, locale, timezone)
    )
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;

    #[test]
    fn every_registered_datatable_exposes_a_permission_mapping() {
        macro_rules! assert_permissions {
            ($(($datatable:ident, $permission:expr)),* $(,)?) => {{
                $(
                    assert_eq!(minimum_read_permission($datatable::ID), Some($permission));
                )*
            }};
        }

        admin_datatables!(assert_permissions);
    }

    #[test]
    fn datatable_ids_remain_unique() {
        macro_rules! collect_ids {
            ($(($datatable:ident, $permission:expr)),* $(,)?) => {{
                let mut ids = BTreeSet::new();
                $(
                    assert!(
                        ids.insert($datatable::ID),
                        "duplicate datatable id `{}`",
                        $datatable::ID
                    );
                )*
            }};
        }

        admin_datatables!(collect_ids);
    }

    #[test]
    fn unknown_datatable_has_no_permission_mapping() {
        assert_eq!(minimum_read_permission("admin.missing"), None);
    }
}
