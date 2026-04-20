use std::collections::BTreeSet;

use forge::prelude::*;

use crate::domain::enums::{enum_key_string, enum_variants, AdminType};
use crate::domain::models::Admin;
use crate::ids::guards::Guard;
use crate::ids::permissions::Permission;
use crate::portals::admin::requests::{CreateAdminRequest, UpdateAdminRequest};

fn parse_permissions(values: &[String]) -> Vec<Permission> {
    values
        .iter()
        .filter_map(|value| Permission::parse_key(value))
        .collect()
}

fn expand_permissions(values: impl IntoIterator<Item = Permission>) -> Vec<Permission> {
    let mut expanded = BTreeSet::new();

    for permission in values {
        expanded.insert(permission);
        if let Some(implied) = permission.implied_permission() {
            expanded.insert(implied);
        }
    }

    expanded.into_iter().collect()
}

pub fn effective_permissions(admin: &Admin) -> Vec<Permission> {
    match admin.admin_type {
        AdminType::Developer | AdminType::SuperAdmin => enum_variants::<Permission>(),
        AdminType::Admin => expand_permissions(parse_permissions(&admin.permissions)),
    }
}

pub fn effective_permission_keys(admin: &Admin) -> Vec<String> {
    effective_permissions(admin)
        .into_iter()
        .map(enum_key_string)
        .collect()
}

pub fn assigned_permissions(admin: &Admin) -> Vec<Permission> {
    parse_permissions(&admin.permissions)
}

pub fn grantable_permissions(admin: &Admin) -> BTreeSet<Permission> {
    effective_permissions(admin).into_iter().collect()
}

pub fn permission_module_count(admin: &Admin) -> usize {
    effective_permissions(admin)
        .into_iter()
        .map(Permission::module)
        .collect::<BTreeSet<_>>()
        .len()
}

pub async fn sync_active_token_abilities(app: &AppContext, admin: &Admin) -> Result<()> {
    let db = app.database()?;
    sync_admin_token_abilities(&*db, admin).await
}

pub async fn list_for_actor(
    app: &AppContext,
    actor: &Admin,
    pagination: Pagination,
) -> Result<Paginated<Admin>> {
    let db = app.database()?;
    scope_visible_admins(Admin::model_query(), actor)
        .order_by(Admin::CREATED_AT.desc())
        .paginate(&*db, pagination)
        .await
}

pub async fn show(app: &AppContext, i18n: &I18n, actor: &Admin, id: &str) -> Result<Admin> {
    let admin = find_by_id(app, i18n, id).await?;
    ensure_can_view(i18n, actor, &admin)?;
    Ok(admin)
}

async fn find_by_id(app: &AppContext, i18n: &I18n, id: &str) -> Result<Admin> {
    let db = app.database()?;
    let model_id: ModelId<Admin> = id
        .parse()
        .map_err(|_| Error::not_found(forge::t!(i18n, "error.not_found")))?;

    Admin::model_query()
        .where_(Admin::ID.eq(model_id))
        .first(&*db)
        .await?
        .ok_or_else(|| Error::not_found(forge::t!(i18n, "error.not_found")))
}

pub fn can_view_target(actor: &Admin, target: &Admin) -> bool {
    match actor.admin_type {
        AdminType::Developer => {
            matches!(target.admin_type, AdminType::SuperAdmin | AdminType::Admin)
        }
        AdminType::SuperAdmin | AdminType::Admin => matches!(target.admin_type, AdminType::Admin),
    }
}

pub fn can_manage_target(actor: &Admin, target: &Admin) -> bool {
    if actor.id == target.id {
        return false;
    }

    match actor.admin_type {
        AdminType::Developer => {
            matches!(target.admin_type, AdminType::SuperAdmin | AdminType::Admin)
        }
        AdminType::SuperAdmin | AdminType::Admin => matches!(target.admin_type, AdminType::Admin),
    }
}

pub fn can_delete_target(actor: &Admin, target: &Admin) -> bool {
    can_manage_target(actor, target)
}

pub fn can_access_observability(admin: &Admin) -> bool {
    matches!(admin.admin_type, AdminType::Developer)
}

pub fn permission_catalogue(actor: &Admin) -> Vec<(Permission, bool)> {
    let grantable = grantable_permissions(actor);

    enum_variants::<Permission>()
        .into_iter()
        .map(|permission| (permission, grantable.contains(&permission)))
        .collect()
}

pub async fn create(
    app: &AppContext,
    i18n: &I18n,
    actor: &Admin,
    req: &CreateAdminRequest,
) -> Result<Admin> {
    ensure_admin_type_allowed(i18n, actor, req.admin_type)?;
    ensure_can_grant(i18n, actor, &req.permissions)?;

    let transaction = app.begin_transaction().await?;

    let created = Admin::model_create()
        .set(Admin::USERNAME, req.username.as_str())
        .set(Admin::EMAIL, req.email.as_str())
        .set(Admin::NAME, req.name.as_str())
        .set(Admin::ADMIN_TYPE, req.admin_type)
        .set(Admin::PASSWORD_HASH, req.password.as_str())
        .set(Admin::PERMISSIONS, permission_keys(&req.permissions))
        .set(Admin::LOCALE, req.locale.as_str())
        .save(&transaction)
        .await?;

    transaction.commit().await?;

    Ok(created)
}

pub async fn update(
    app: &AppContext,
    i18n: &I18n,
    actor: &Admin,
    target_id: &str,
    req: &UpdateAdminRequest,
) -> Result<Admin> {
    let target = find_by_id(app, i18n, target_id).await?;

    ensure_not_self(i18n, actor, &target)?;
    ensure_can_manage(i18n, actor, &target)?;

    if let Some(admin_type) = req.admin_type {
        ensure_admin_type_allowed(i18n, actor, admin_type)?;
    }

    if let Some(permissions) = req.permissions.as_ref() {
        ensure_can_grant(i18n, actor, permissions)?;
    }

    let transaction = app.begin_transaction().await?;
    let mut update = target.update();

    if let Some(name) = req.name.as_deref() {
        update = update.set(Admin::NAME, name);
    }
    if let Some(email) = req.email.as_deref() {
        update = update.set(Admin::EMAIL, email);
    }
    if let Some(password) = req.password.as_deref() {
        update = update.set(Admin::PASSWORD_HASH, password);
    }
    if let Some(locale) = req.locale.as_deref() {
        update = update.set(Admin::LOCALE, locale);
    }
    if let Some(admin_type) = req.admin_type {
        update = update.set(Admin::ADMIN_TYPE, admin_type);
    }
    if let Some(permissions) = req.permissions.as_ref() {
        update = update.set(Admin::PERMISSIONS, permission_keys(permissions));
    }

    let updated = update.save(&transaction).await?;
    sync_admin_token_abilities(&transaction, &updated).await?;

    transaction.commit().await?;

    Ok(updated)
}

pub async fn delete(app: &AppContext, i18n: &I18n, actor: &Admin, target_id: &str) -> Result<()> {
    let target = find_by_id(app, i18n, target_id).await?;

    ensure_not_self(i18n, actor, &target)?;
    ensure_can_manage(i18n, actor, &target)?;

    let transaction = app.begin_transaction().await?;
    target.delete().execute(&transaction).await?;
    revoke_admin_tokens(&transaction, &target).await?;
    transaction.commit().await?;

    Ok(())
}

fn ensure_not_self(i18n: &I18n, actor: &Admin, target: &Admin) -> Result<()> {
    if actor.id == target.id {
        return Err(Error::http(
            403,
            forge::t!(i18n, "admin.errors.cannot_edit_self"),
        ));
    }

    Ok(())
}

fn ensure_can_view(i18n: &I18n, actor: &Admin, target: &Admin) -> Result<()> {
    if !can_view_target(actor, target) {
        return Err(Error::http(
            403,
            forge::t!(i18n, "admin.errors.cannot_view_tier"),
        ));
    }

    Ok(())
}

fn ensure_can_manage(i18n: &I18n, actor: &Admin, target: &Admin) -> Result<()> {
    if !can_manage_target(actor, target) {
        return Err(Error::http(
            403,
            forge::t!(i18n, "admin.errors.cannot_manage_tier"),
        ));
    }

    Ok(())
}

fn ensure_admin_type_allowed(i18n: &I18n, actor: &Admin, requested_type: AdminType) -> Result<()> {
    let allowed = match actor.admin_type {
        AdminType::Developer => matches!(requested_type, AdminType::SuperAdmin | AdminType::Admin),
        AdminType::SuperAdmin | AdminType::Admin => matches!(requested_type, AdminType::Admin),
    };

    if !allowed {
        return Err(Error::http(
            403,
            forge::t!(i18n, "admin.errors.invalid_admin_type"),
        ));
    }

    Ok(())
}

fn ensure_can_grant(
    i18n: &I18n,
    actor: &Admin,
    requested_permissions: &[Permission],
) -> Result<()> {
    if matches!(
        actor.admin_type,
        AdminType::Developer | AdminType::SuperAdmin
    ) {
        return Ok(());
    }

    let grantable = grantable_permissions(actor);

    for permission in requested_permissions {
        if !grantable.contains(permission) {
            let permission_key = enum_key_string(*permission);
            return Err(Error::http(
                403,
                forge::t!(
                    i18n,
                    "admin.errors.cannot_grant_permission",
                    permission = permission_key.as_str()
                ),
            ));
        }
    }

    Ok(())
}

fn permission_keys(permissions: &[Permission]) -> Vec<String> {
    permissions.iter().copied().map(enum_key_string).collect()
}

pub fn scope_visible_admins(query: ModelQuery<Admin>, actor: &Admin) -> ModelQuery<Admin> {
    match actor.admin_type {
        AdminType::Developer => query.where_(Admin::ADMIN_TYPE.not_eq(AdminType::Developer)),
        AdminType::SuperAdmin | AdminType::Admin => {
            query.where_(Admin::ADMIN_TYPE.eq(AdminType::Admin))
        }
    }
}

async fn sync_admin_token_abilities<E>(executor: &E, admin: &Admin) -> Result<()>
where
    E: QueryExecutor,
{
    let actor_id = admin.token_actor_id();
    let abilities = serde_json::Value::Array(
        effective_permission_keys(admin)
            .into_iter()
            .map(serde_json::Value::String)
            .collect(),
    );

    executor
        .raw_execute(
            r#"UPDATE personal_access_tokens
               SET abilities = $1
               WHERE guard = $2
                 AND actor_id = $3
                 AND revoked_at IS NULL"#,
            &[
                DbValue::Json(abilities),
                DbValue::Text(GuardId::from(Guard::Admin).to_string()),
                DbValue::Text(actor_id),
            ],
        )
        .await?;

    Ok(())
}

async fn revoke_admin_tokens<E>(executor: &E, admin: &Admin) -> Result<()>
where
    E: QueryExecutor,
{
    let actor_id = admin.token_actor_id();
    executor
        .raw_execute(
            r#"UPDATE personal_access_tokens
               SET revoked_at = NOW()
               WHERE guard = $1
                 AND actor_id = $2
                 AND revoked_at IS NULL"#,
            &[
                DbValue::Text(GuardId::from(Guard::Admin).to_string()),
                DbValue::Text(actor_id),
            ],
        )
        .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn admin_fixture(id: ModelId<Admin>, admin_type: AdminType) -> Admin {
        Admin {
            id,
            username: format!("user-{id}"),
            email: format!("user-{id}@example.com"),
            name: format!("User {id}"),
            admin_type,
            permissions: Vec::new(),
            password_hash: "hashed".into(),
            locale: "en".into(),
            created_at: DateTime::now(),
            updated_at: DateTime::now(),
            deleted_at: None,
        }
    }

    #[test]
    fn developer_can_view_super_admin_and_admin_but_not_developer_rows() {
        let developer = admin_fixture(ModelId::generate(), AdminType::Developer);
        let other_developer = admin_fixture(ModelId::generate(), AdminType::Developer);
        let super_admin = admin_fixture(ModelId::generate(), AdminType::SuperAdmin);
        let admin = admin_fixture(ModelId::generate(), AdminType::Admin);

        assert!(!can_view_target(&developer, &developer));
        assert!(!can_view_target(&developer, &other_developer));
        assert!(can_view_target(&developer, &super_admin));
        assert!(can_view_target(&developer, &admin));

        assert!(!can_manage_target(&developer, &developer));
        assert!(!can_manage_target(&developer, &other_developer));
        assert!(can_manage_target(&developer, &super_admin));
        assert!(can_manage_target(&developer, &admin));
    }

    #[test]
    fn super_admin_can_only_view_and_manage_admin_rows() {
        let super_admin = admin_fixture(ModelId::generate(), AdminType::SuperAdmin);
        let other_super_admin = admin_fixture(ModelId::generate(), AdminType::SuperAdmin);
        let developer = admin_fixture(ModelId::generate(), AdminType::Developer);
        let admin = admin_fixture(ModelId::generate(), AdminType::Admin);

        assert!(!can_view_target(&super_admin, &super_admin));
        assert!(!can_view_target(&super_admin, &other_super_admin));
        assert!(!can_view_target(&super_admin, &developer));
        assert!(can_view_target(&super_admin, &admin));

        assert!(!can_manage_target(&super_admin, &super_admin));
        assert!(!can_manage_target(&super_admin, &other_super_admin));
        assert!(!can_manage_target(&super_admin, &developer));
        assert!(can_manage_target(&super_admin, &admin));
    }

    #[test]
    fn admin_can_only_manage_other_admin_rows() {
        let actor_id = ModelId::generate();
        let actor = admin_fixture(actor_id, AdminType::Admin);
        let self_admin = admin_fixture(actor_id, AdminType::Admin);
        let other_admin = admin_fixture(ModelId::generate(), AdminType::Admin);
        let super_admin = admin_fixture(ModelId::generate(), AdminType::SuperAdmin);

        assert!(can_view_target(&actor, &self_admin));
        assert!(can_view_target(&actor, &other_admin));
        assert!(!can_view_target(&actor, &super_admin));

        assert!(!can_manage_target(&actor, &self_admin));
        assert!(can_manage_target(&actor, &other_admin));
        assert!(!can_manage_target(&actor, &super_admin));
        assert!(can_delete_target(&actor, &other_admin));
    }

    #[test]
    fn permission_module_count_counts_each_module_once() {
        let mut admin = admin_fixture(ModelId::generate(), AdminType::Admin);
        admin.permissions = vec![
            enum_key_string(Permission::AdminsManage),
            enum_key_string(Permission::UsersRead),
            enum_key_string(Permission::CountriesManage),
        ];

        assert_eq!(permission_module_count(&admin), 3);
    }

    #[test]
    fn bypass_admin_types_count_all_modules() {
        let developer = admin_fixture(ModelId::generate(), AdminType::Developer);
        let super_admin = admin_fixture(ModelId::generate(), AdminType::SuperAdmin);

        assert_eq!(permission_module_count(&developer), 7);
        assert_eq!(permission_module_count(&super_admin), 7);
    }

    #[test]
    fn observability_access_is_developer_only() {
        let developer = admin_fixture(ModelId::generate(), AdminType::Developer);
        let super_admin = admin_fixture(ModelId::generate(), AdminType::SuperAdmin);
        let admin = admin_fixture(ModelId::generate(), AdminType::Admin);

        assert!(can_access_observability(&developer));
        assert!(!can_access_observability(&super_admin));
        assert!(!can_access_observability(&admin));
    }
}
