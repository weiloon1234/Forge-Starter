use forge::prelude::*;
use crate::ids::guards::Guard;
use crate::ids::permissions::Permission;
use crate::portals::user::requests::{LoginRequest, UpdateProfileRequest};
use crate::portals::user::responses::UserResponse;

pub mod auth_routes;
pub mod datatables;
pub mod profile_routes;
pub mod requests;
pub mod resources;
pub mod responses;

pub fn register(r: &mut HttpRegistrar) -> Result<()> {
    r.api_version(1, |r| {
        r.group("/user", |r| {
            // ── Auth ────────────────────────────────────
            r.route_named_with_options(
                "user.auth.login",
                "/auth/login",
                post(auth_routes::login),
                HttpRouteOptions::new()
                    .document(RouteDoc::new()
                        .post()
                        .summary("User login (token)")
                        .tag("user:auth")
                        .request::<LoginRequest>()
                        .response::<TokenPair>(200)),
            );
            r.route_named_with_options(
                "user.auth.refresh",
                "/auth/refresh",
                post(auth_routes::refresh),
                HttpRouteOptions::new()
                    .document(RouteDoc::new()
                        .post()
                        .summary("Refresh access token")
                        .tag("user:auth")
                        .response::<TokenPair>(200)),
            );

            // ── Profile ─────────────────────────────────
            r.route_named_with_options(
                "user.me.show",
                "/me",
                get(profile_routes::show),
                HttpRouteOptions::new()
                    .guard(Guard::User)
                    .permission(Permission::ProfileView)
                    .document(RouteDoc::new()
                        .get()
                        .summary("Get authenticated user profile")
                        .tag("user:profile")
                        .response::<UserResponse>(200)),
            );
            r.route_named_with_options(
                "user.me.update",
                "/me",
                put(profile_routes::update),
                HttpRouteOptions::new()
                    .guard(Guard::User)
                    .permission(Permission::ProfileEdit)
                    .document(RouteDoc::new()
                        .put()
                        .summary("Update user profile")
                        .tag("user:profile")
                        .request::<UpdateProfileRequest>()
                        .response::<UserResponse>(200)),
            );

            Ok(())
        })?;
        Ok(())
    })?;

    Ok(())
}
