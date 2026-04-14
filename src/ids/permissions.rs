use forge::prelude::*;

#[derive(Clone, Copy)]
pub enum Permission {
    ProfileView,
    ProfileEdit,
    UsersManage,
    UsersDelete,
}

impl From<Permission> for PermissionId {
    fn from(v: Permission) -> Self {
        match v {
            Permission::ProfileView => PermissionId::new("profile:view"),
            Permission::ProfileEdit => PermissionId::new("profile:edit"),
            Permission::UsersManage => PermissionId::new("users:manage"),
            Permission::UsersDelete => PermissionId::new("users:delete"),
        }
    }
}
