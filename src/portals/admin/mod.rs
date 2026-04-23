use forge::prelude::*;

mod scopes;

pub mod admin_routes;
pub mod auth_routes;
pub mod badge_routes;
pub mod country_routes;
pub mod credit_routes;
pub mod datatable_routes;
pub mod datatables;
pub mod editor_asset_routes;
pub mod log_routes;
pub mod page_routes;
pub mod profile_routes;
pub mod requests;
pub mod resources;
pub mod responses;
pub mod setting_routes;
pub mod user_routes;

pub fn register(r: &mut HttpRegistrar) -> Result<()> {
    r.api_version(1, |r| {
        r.scope("/admin", |admin| {
            admin.name_prefix("admin");
            admin.audit_area("admin");

            scopes::register_auth_scope(admin)?;
            scopes::register_profile_scope(admin)?;
            scopes::register_badge_scope(admin)?;
            scopes::register_admin_scope(admin)?;
            scopes::register_user_scope(admin)?;
            scopes::register_country_scope(admin)?;
            scopes::register_credit_scope(admin)?;
            scopes::register_setting_scope(admin)?;
            scopes::register_page_scope(admin)?;
            scopes::register_editor_asset_scope(admin)?;
            scopes::register_log_scope(admin)?;
            scopes::register_datatable_scope(admin)?;

            Ok(())
        })?;
        Ok(())
    })?;

    Ok(())
}
