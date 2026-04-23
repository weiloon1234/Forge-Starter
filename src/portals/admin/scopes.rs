use forge::prelude::*;

use crate::ids::guards::Guard;
use crate::ids::permissions::Permission;
use crate::portals::admin::requests::{
    AdminLoginRequest, ChangeAdminPasswordRequest, ChangeUserIntroducerRequest,
    CreateAdminCreditAdjustmentRequest, CreateAdminRequest, CreatePageRequest, CreateUserRequest,
    UpdateAdminLocaleRequest, UpdateAdminProfileRequest, UpdateAdminRequest, UpdateCountryRequest,
    UpdatePageRequest, UpdateSettingValueRequest, UpdateUserRequest,
};
use crate::portals::admin::responses::{
    AdminCreditAdjustmentResponse, AdminEditorAssetUploadResponse, AdminMeResponse,
    AdminPageResponse, AdminPermissionResponse, AdminResponse, AdminSettingResponse,
    AdminUserIntroducerChangeResponse, AdminUserLookupOptionResponse, AdminUserResponse,
    BadgeCountsResponse, LogEntryResponse, LogFileResponse,
};

use super::{
    admin_routes, auth_routes, badge_routes, country_routes, credit_routes, datatable_routes,
    editor_asset_routes, log_routes, page_routes, profile_routes, setting_routes, user_routes,
};

pub fn register_auth_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/auth", |auth| {
        auth.name_prefix("auth").tag("admin:auth").public();

        auth.post("/login", "login", auth_routes::login, |route| {
            route.summary("Admin login (token)");
            route.request::<AdminLoginRequest>();
            route.response::<TokenPair>(200);
        });

        auth.post("/refresh", "refresh", auth_routes::refresh, |route| {
            route.summary("Refresh admin access token");
            route.request::<RefreshTokenRequest>();
            route.response::<TokenPair>(200);
        });

        auth.post("/logout", "logout", auth_routes::logout, |route| {
            route.guard(Guard::Admin);
            route.summary("Admin logout");
            route.response::<MessageResponse>(200);
        });

        auth.post("/ws-token", "ws_token", auth_routes::ws_token, |route| {
            route.guard(Guard::Admin);
            route.summary("Get short-lived WebSocket token");
            route.response::<WsTokenResponse>(200);
        });

        auth.get("/me", "me", auth_routes::me, |route| {
            route.guard(Guard::Admin);
            route.summary("Get authenticated admin profile");
            route.response::<AdminMeResponse>(200);
        });

        Ok(())
    })?;

    Ok(())
}

pub fn register_profile_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/profile", |profile| {
        profile
            .name_prefix("profile")
            .tag("admin:profile")
            .guard(Guard::Admin);

        profile.put("", "update", profile_routes::update_profile, |route| {
            route.summary("Update admin profile");
            route.request::<UpdateAdminProfileRequest>();
            route.response::<AdminMeResponse>(200);
        });

        profile.put(
            "/locale",
            "locale",
            profile_routes::update_locale,
            |route| {
                route.summary("Update admin locale preference");
                route.request::<UpdateAdminLocaleRequest>();
                route.response::<MessageResponse>(200);
            },
        );

        profile.put(
            "/password",
            "change_password",
            profile_routes::change_password,
            |route| {
                route.summary("Change admin password");
                route.request::<ChangeAdminPasswordRequest>();
                route.response::<MessageResponse>(200);
            },
        );

        Ok(())
    })?;

    Ok(())
}

pub fn register_badge_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/badges", |badges| {
        badges
            .name_prefix("badges")
            .tag("admin:badges")
            .guard(Guard::Admin);

        badges.get("", "index", badge_routes::index, |route| {
            route.summary("Current admin badge counts");
            route.response::<BadgeCountsResponse>(200);
        });

        Ok(())
    })?;

    Ok(())
}

pub fn register_admin_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/admins", |admins| {
        admins
            .name_prefix("admins")
            .tag("admin:admins")
            .guard(Guard::Admin)
            .permission(Permission::AdminsRead);

        admins.get(
            "/permissions",
            "permissions",
            admin_routes::permissions,
            |route| {
                route.summary("List grantable permissions for the current admin");
                route.response::<Vec<AdminPermissionResponse>>(200);
            },
        );

        admins.get("", "index", admin_routes::index, |route| {
            route.summary("List admins (paginated)");
        });

        admins.post("", "store", admin_routes::store, |route| {
            route.permissions([Permission::AdminsManage]);
            route.summary("Create admin");
            route.request::<CreateAdminRequest>();
            route.response::<AdminResponse>(201);
        });

        admins.get("/{id}", "show", admin_routes::show, |route| {
            route.summary("Get admin by ID");
            route.response::<AdminResponse>(200);
        });

        admins.put("/{id}", "update", admin_routes::update, |route| {
            route.permissions([Permission::AdminsManage]);
            route.summary("Update admin");
            route.request::<UpdateAdminRequest>();
            route.response::<AdminResponse>(200);
        });

        admins.delete("/{id}", "destroy", admin_routes::destroy, |route| {
            route.permissions([Permission::AdminsManage]);
            route.summary("Delete admin");
            route.response::<MessageResponse>(200);
        });

        Ok(())
    })?;

    Ok(())
}

pub fn register_user_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/users", |users| {
        users
            .name_prefix("users")
            .tag("admin:users")
            .guard(Guard::Admin)
            .permission(Permission::UsersRead);

        users.get("", "index", user_routes::index, |route| {
            route.summary("List users (paginated)");
        });

        users.get("/options", "options", user_routes::user_options, |route| {
            route.permission(Permission::IntroducerChangesManage);
            route.summary("Search users for introducer change selection");
            route.response::<Vec<AdminUserLookupOptionResponse>>(200);
        });

        users.post("", "store", user_routes::store, |route| {
            route.permission(Permission::UsersManage);
            route.summary("Create user");
            route.request::<CreateUserRequest>();
            route.response::<AdminUserResponse>(201);
        });

        users.post(
            "/{id}/introducer-changes",
            "introducer_changes_store",
            user_routes::store_introducer_change,
            |route| {
                route.permission(Permission::IntroducerChangesManage);
                route.summary("Change a user's introducer and write an admin audit trail");
                route.request::<ChangeUserIntroducerRequest>();
                route.response::<AdminUserIntroducerChangeResponse>(201);
            },
        );

        users.get("/{id}", "show", user_routes::show, |route| {
            route.summary("Get user by ID");
            route.response::<AdminUserResponse>(200);
        });

        users.put("/{id}", "update", user_routes::update, |route| {
            route.permission(Permission::UsersManage);
            route.summary("Update user");
            route.request::<UpdateUserRequest>();
            route.response::<AdminUserResponse>(200);
        });

        Ok(())
    })?;

    Ok(())
}

pub fn register_country_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/countries", |countries| {
        countries
            .name_prefix("countries")
            .tag("admin:countries")
            .guard(Guard::Admin);

        countries.put("/{iso2}", "update", country_routes::update, |route| {
            route.permission(Permission::CountriesManage);
            route.summary("Update country");
            route.request::<UpdateCountryRequest>();
            route.response::<MessageResponse>(200);
        });

        Ok(())
    })?;

    Ok(())
}

pub fn register_credit_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/credits", |credits| {
        credits
            .name_prefix("credits")
            .tag("admin:credits")
            .guard(Guard::Admin)
            .permission(Permission::CreditsRead);

        credits.get(
            "/users/options",
            "user_options",
            credit_routes::user_options,
            |route| {
                route.permission(Permission::CreditsManage);
                route.summary("Search users for credit adjustment selection");
                route.response::<Vec<AdminUserLookupOptionResponse>>(200);
            },
        );

        credits.scope("/adjustments", |adjustments| {
            adjustments
                .name_prefix("adjustments")
                .tag("admin:credit-adjustments");

            adjustments.post("", "store", credit_routes::store, |route| {
                route.permission(Permission::CreditsManage);
                route.summary("Create a manual admin credit adjustment");
                route.request::<CreateAdminCreditAdjustmentRequest>();
                route.response::<AdminCreditAdjustmentResponse>(201);
            });

            Ok(())
        })?;

        Ok(())
    })?;

    Ok(())
}

pub fn register_setting_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/settings", |settings| {
        settings
            .name_prefix("settings")
            .tag("admin:settings")
            .guard(Guard::Admin)
            .permission(Permission::SettingsRead);

        settings.get("/{key}", "show", setting_routes::show, |route| {
            route.summary("Get setting detail for editing");
            route.response::<AdminSettingResponse>(200);
        });

        settings.put("/{key}", "update", setting_routes::update, |route| {
            route.permission(Permission::SettingsManage);
            route.summary("Update a setting value");
            route.request::<UpdateSettingValueRequest>();
            route.response::<AdminSettingResponse>(200);
        });

        settings.post("/{key}/upload", "upload", setting_routes::upload, |route| {
            route.permission(Permission::SettingsManage);
            route.summary("Upload and replace a file/image setting value");
            route.response::<AdminSettingResponse>(200);
        });

        Ok(())
    })?;

    Ok(())
}

pub fn register_page_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/pages", |pages| {
        pages
            .name_prefix("pages")
            .tag("admin:pages")
            .guard(Guard::Admin)
            .permission(Permission::PagesRead);

        pages.get("/{id}", "show", page_routes::show, |route| {
            route.summary("Get page detail for editing");
            route.response::<AdminPageResponse>(200);
        });

        pages.post("", "store", page_routes::store, |route| {
            route.permission(Permission::PagesManage);
            route.summary("Create page");
            route.request::<CreatePageRequest>();
            route.response::<AdminPageResponse>(200);
        });

        pages.put("/{id}", "update", page_routes::update, |route| {
            route.permission(Permission::PagesManage);
            route.summary("Update page");
            route.request::<UpdatePageRequest>();
            route.response::<AdminPageResponse>(200);
        });

        pages.delete("/{id}", "destroy", page_routes::destroy, |route| {
            route.permission(Permission::PagesManage);
            route.summary("Delete page");
            route.response::<MessageResponse>(200);
        });

        pages.post(
            "/{id}/cover",
            "upload_cover",
            page_routes::upload_cover,
            |route| {
                route.permission(Permission::PagesManage);
                route.summary("Upload or replace page cover");
                route.response::<AdminPageResponse>(200);
            },
        );

        pages.delete(
            "/{id}/cover",
            "delete_cover",
            page_routes::delete_cover,
            |route| {
                route.permission(Permission::PagesManage);
                route.summary("Delete page cover");
                route.response::<AdminPageResponse>(200);
            },
        );

        Ok(())
    })?;

    Ok(())
}

pub fn register_editor_asset_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/editor-assets", |editor_assets| {
        editor_assets
            .name_prefix("editor_assets")
            .tag("admin:editor-assets")
            .guard(Guard::Admin);

        editor_assets.post("/upload", "upload", editor_asset_routes::upload, |route| {
            route.summary("Upload a Froala editor file or image");
            route.response::<AdminEditorAssetUploadResponse>(200);
        });

        Ok(())
    })?;

    Ok(())
}

pub fn register_log_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/logs", |logs| {
        logs.name_prefix("logs")
            .tag("admin:logs")
            .guard(Guard::Admin)
            .permission(Permission::LogsRead);

        logs.get("", "index", log_routes::index, |route| {
            route.summary("List log files");
            route.response::<Vec<LogFileResponse>>(200);
        });

        logs.get("/{filename}", "show", log_routes::show, |route| {
            route.summary("Read tail of a log file");
            route.response::<Vec<LogEntryResponse>>(200);
        });

        logs.delete("/{filename}", "destroy", log_routes::destroy, |route| {
            route.permission(Permission::LogsManage);
            route.summary("Delete a log file");
            route.response::<MessageResponse>(200);
        });

        Ok(())
    })?;

    Ok(())
}

pub fn register_datatable_scope(admin: &mut HttpScope<'_>) -> Result<()> {
    admin.scope("/datatables", |datatables| {
        datatables
            .name_prefix("datatables")
            .tag("admin:datatables")
            .guard(Guard::Admin);

        datatables.get("/{id}/query", "query", datatable_routes::query, |route| {
            route.summary("Query datatable");
        });

        datatables.get(
            "/{id}/download",
            "download",
            datatable_routes::download,
            |route| {
                route.summary("Download datatable as XLSX");
            },
        );

        Ok(())
    })?;

    Ok(())
}
