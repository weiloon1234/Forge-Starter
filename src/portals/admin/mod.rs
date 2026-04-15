use forge::prelude::*;
use crate::ids::guards::Guard;
use crate::ids::permissions::Permission;
use crate::portals::admin::requests::{AdminLoginRequest, ChangeAdminPasswordRequest, UpdateAdminLocaleRequest, UpdateAdminProfileRequest};
use crate::portals::admin::responses::{AdminMeResponse, AdminUserResponse};
use crate::types::MessageResponse;

pub mod auth_routes;
pub mod datatable_routes;
pub mod datatables;
pub mod profile_routes;
pub mod user_routes;
pub mod requests;
pub mod resources;
pub mod responses;

pub fn register(r: &mut HttpRegistrar) -> Result<()> {
    r.api_version(1, |r| {
        r.group("/admin", |r| {
            // ── Auth ────────────────────────────────────
            r.route_named_with_options(
                "admin.auth.login",
                "/auth/login",
                post(auth_routes::login),
                HttpRouteOptions::new()
                    .document(RouteDoc::new()
                        .post()
                        .summary("Admin login (session)")
                        .tag("admin:auth")
                        .request::<AdminLoginRequest>()
                        .response::<MessageResponse>(200)),
            );
            r.route_named_with_options(
                "admin.auth.logout",
                "/auth/logout",
                post(auth_routes::logout),
                HttpRouteOptions::new()
                    .guard(Guard::Admin)
                    .document(RouteDoc::new()
                        .post()
                        .summary("Admin logout")
                        .tag("admin:auth")
                        .response::<MessageResponse>(200)),
            );
            r.route_named_with_options(
                "admin.auth.me",
                "/auth/me",
                get(auth_routes::me),
                HttpRouteOptions::new()
                    .guard(Guard::Admin)
                    .document(RouteDoc::new()
                        .get()
                        .summary("Get authenticated admin profile")
                        .tag("admin:auth")
                        .response::<AdminMeResponse>(200)),
            );

            // ── Profile ─────────────────────────────────
            r.route_named_with_options(
                "admin.profile.update",
                "/profile",
                put(profile_routes::update_profile),
                HttpRouteOptions::new()
                    .guard(Guard::Admin)
                    .document(RouteDoc::new()
                        .put()
                        .summary("Update admin profile")
                        .tag("admin:profile")
                        .request::<UpdateAdminProfileRequest>()
                        .response::<AdminMeResponse>(200)),
            );
            r.route_named_with_options(
                "admin.profile.locale",
                "/profile/locale",
                put(profile_routes::update_locale),
                HttpRouteOptions::new()
                    .guard(Guard::Admin)
                    .document(RouteDoc::new()
                        .put()
                        .summary("Update admin locale preference")
                        .tag("admin:profile")
                        .request::<UpdateAdminLocaleRequest>()
                        .response::<MessageResponse>(200)),
            );
            r.route_named_with_options(
                "admin.profile.change_password",
                "/profile/password",
                put(profile_routes::change_password),
                HttpRouteOptions::new()
                    .guard(Guard::Admin)
                    .document(RouteDoc::new()
                        .put()
                        .summary("Change admin password")
                        .tag("admin:profile")
                        .request::<ChangeAdminPasswordRequest>()
                        .response::<MessageResponse>(200)),
            );

            // ── Users ───────────────────────────────────
            r.route_named_with_options(
                "admin.users.index",
                "/users",
                get(user_routes::index),
                HttpRouteOptions::new()
                    .guard(Guard::Admin)
                    .permission(Permission::UsersManage)
                    .document(RouteDoc::new()
                        .get()
                        .summary("List users (paginated)")
                        .tag("admin:users")),
            );
            r.route_named_with_options(
                "admin.users.show",
                "/users/{id}",
                get(user_routes::show),
                HttpRouteOptions::new()
                    .guard(Guard::Admin)
                    .permission(Permission::UsersManage)
                    .document(RouteDoc::new()
                        .get()
                        .summary("Get user by ID")
                        .tag("admin:users")
                        .response::<AdminUserResponse>(200)),
            );

            // ── Datatables ──────────────────────────────
            r.route_named_with_options(
                "admin.datatables.query",
                "/datatables/{id}/query",
                get(datatable_routes::query),
                HttpRouteOptions::new()
                    .guard(Guard::Admin)
                    .document(RouteDoc::new()
                        .get()
                        .summary("Query datatable")
                        .tag("admin:datatables")),
            );
            r.route_named_with_options(
                "admin.datatables.download",
                "/datatables/{id}/download",
                get(datatable_routes::download),
                HttpRouteOptions::new()
                    .guard(Guard::Admin)
                    .document(RouteDoc::new()
                        .get()
                        .summary("Download datatable as XLSX")
                        .tag("admin:datatables")),
            );

            Ok(())
        })?;
        Ok(())
    })?;

    Ok(())
}
