use forge::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, forge::AppEnum, ts_rs::TS)]
#[ts(export)]
pub enum Permission {
    #[forge(key = "exports.read")]
    ExportsRead,
    #[forge(key = "observability.view")]
    ObservabilityView,
    #[forge(key = "admins.read")]
    AdminsRead,
    #[forge(key = "admins.manage")]
    AdminsManage,
    #[forge(key = "users.read")]
    UsersRead,
    #[forge(key = "users.manage")]
    UsersManage,
    #[forge(key = "countries.read")]
    CountriesRead,
    #[forge(key = "countries.manage")]
    CountriesManage,
    #[forge(key = "settings.read")]
    SettingsRead,
    #[forge(key = "settings.manage")]
    SettingsManage,
    #[forge(key = "logs.read")]
    LogsRead,
    #[forge(key = "logs.manage")]
    LogsManage,
}

impl Permission {
    pub const fn all() -> [Self; 12] {
        [
            Self::ExportsRead,
            Self::ObservabilityView,
            Self::AdminsRead,
            Self::AdminsManage,
            Self::UsersRead,
            Self::UsersManage,
            Self::CountriesRead,
            Self::CountriesManage,
            Self::SettingsRead,
            Self::SettingsManage,
            Self::LogsRead,
            Self::LogsManage,
        ]
    }

    pub const fn as_key(self) -> &'static str {
        match self {
            Self::ExportsRead => "exports.read",
            Self::ObservabilityView => "observability.view",
            Self::AdminsRead => "admins.read",
            Self::AdminsManage => "admins.manage",
            Self::UsersRead => "users.read",
            Self::UsersManage => "users.manage",
            Self::CountriesRead => "countries.read",
            Self::CountriesManage => "countries.manage",
            Self::SettingsRead => "settings.read",
            Self::SettingsManage => "settings.manage",
            Self::LogsRead => "logs.read",
            Self::LogsManage => "logs.manage",
        }
    }

    pub const fn module(self) -> &'static str {
        match self {
            Self::ExportsRead => "exports",
            Self::ObservabilityView => "observability",
            Self::AdminsRead | Self::AdminsManage => "admins",
            Self::UsersRead | Self::UsersManage => "users",
            Self::CountriesRead | Self::CountriesManage => "countries",
            Self::SettingsRead | Self::SettingsManage => "settings",
            Self::LogsRead | Self::LogsManage => "logs",
        }
    }

    pub const fn action(self) -> &'static str {
        match self {
            Self::ExportsRead
            | Self::ObservabilityView
            | Self::AdminsRead
            | Self::UsersRead
            | Self::CountriesRead
            | Self::SettingsRead
            | Self::LogsRead => "read",
            Self::AdminsManage
            | Self::UsersManage
            | Self::CountriesManage
            | Self::SettingsManage
            | Self::LogsManage => {
                "manage"
            }
        }
    }

    pub const fn implied_permission(self) -> Option<Self> {
        match self {
            Self::AdminsManage => Some(Self::AdminsRead),
            Self::UsersManage => Some(Self::UsersRead),
            Self::CountriesManage => Some(Self::CountriesRead),
            Self::SettingsManage => Some(Self::SettingsRead),
            Self::LogsManage => Some(Self::LogsRead),
            _ => None,
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::parse_key(value)
    }
}

impl From<Permission> for PermissionId {
    fn from(value: Permission) -> Self {
        PermissionId::new(value.as_key())
    }
}

impl AsRef<str> for Permission {
    fn as_ref(&self) -> &str {
        self.as_key()
    }
}

#[cfg(test)]
mod tests {
    use super::Permission;

    #[test]
    fn parse_recognizes_observability_view() {
        assert_eq!(
            Permission::parse("observability.view"),
            Some(Permission::ObservabilityView)
        );
    }

    #[test]
    fn all_includes_observability_view() {
        assert!(Permission::all().contains(&Permission::ObservabilityView));
    }
}
