use forge::prelude::*;
use crate::ids::guards::Guard;
use crate::ids::permissions::Permission;

pub mod auth_routes;
pub mod user_routes;
pub mod requests;
pub mod resources;
pub mod responses;

pub fn register(r: &mut HttpRegistrar) -> Result<()> {
    r.group("/admin", |r| {
        // Public
        r.route("/auth/login", post(auth_routes::login));
        r.route("/auth/logout", post(auth_routes::logout));

        // Protected — requires Admin guard
        r.route_with_options(
            "/users",
            get(user_routes::index),
            HttpRouteOptions::new()
                .guard(Guard::Admin)
                .permission(Permission::UsersManage),
        );
        r.route_with_options(
            "/users/:id",
            get(user_routes::show),
            HttpRouteOptions::new()
                .guard(Guard::Admin)
                .permission(Permission::UsersManage),
        );

        Ok(())
    })?;

    Ok(())
}
