use forge::prelude::*;
use crate::ids::guards::Guard;
use crate::ids::permissions::Permission;

pub mod auth_routes;
pub mod profile_routes;
pub mod requests;
pub mod resources;
pub mod responses;

pub fn register(r: &mut HttpRegistrar) -> Result<()> {
    r.api_version(1, |r| {
        // Public
        r.route("/auth/login", post(auth_routes::login));
        r.route("/auth/refresh", post(auth_routes::refresh));

        // Protected — requires User guard
        r.route_with_options(
            "/me",
            get(profile_routes::show),
            HttpRouteOptions::new()
                .guard(Guard::User)
                .permission(Permission::ProfileView),
        );
        r.route_with_options(
            "/me",
            put(profile_routes::update),
            HttpRouteOptions::new()
                .guard(Guard::User)
                .permission(Permission::ProfileEdit),
        );

        Ok(())
    })?;

    Ok(())
}
