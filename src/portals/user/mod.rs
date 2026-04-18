use crate::ids::guards::Guard;
use crate::portals::user::requests::{LoginRequest, UpdateProfileRequest};
use crate::portals::user::responses::UserResponse;
use forge::prelude::*;

pub mod auth_routes;
pub mod datatables;
pub mod profile_routes;
pub mod requests;
pub mod resources;
pub mod responses;

pub fn register(r: &mut HttpRegistrar) -> Result<()> {
    r.api_version(1, |r| {
        r.scope("/user", |user| {
            user.name_prefix("user");

            user.scope("/auth", |auth| {
                auth.name_prefix("auth").tag("user:auth").public();

                auth.post("/login", "login", auth_routes::login, |route| {
                    route.summary("User login (token)");
                    route.request::<LoginRequest>();
                    route.response::<TokenPair>(200);
                });

                auth.post("/refresh", "refresh", auth_routes::refresh, |route| {
                    route.summary("Refresh access token");
                    route.request::<RefreshTokenRequest>();
                    route.response::<TokenPair>(200);
                });

                Ok(())
            })?;

            user.scope("/me", |me| {
                me.name_prefix("me").tag("user:profile").guard(Guard::User);

                me.get("", "show", profile_routes::show, |route| {
                    route.summary("Get authenticated user profile");
                    route.response::<UserResponse>(200);
                });

                me.put("", "update", profile_routes::update, |route| {
                    route.summary("Update user profile");
                    route.request::<UpdateProfileRequest>();
                    route.response::<UserResponse>(200);
                });

                Ok(())
            })?;

            Ok(())
        })?;
        Ok(())
    })?;

    Ok(())
}
