use forge::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, forge::AppEnum)]
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
    #[forge(key = "pages.read")]
    PagesRead,
    #[forge(key = "pages.manage")]
    PagesManage,
    #[forge(key = "credits.read")]
    CreditsRead,
    #[forge(key = "credits.manage")]
    CreditsManage,
    #[forge(key = "credit_transactions.read")]
    CreditTransactionsRead,
    #[forge(key = "logs.read")]
    LogsRead,
    #[forge(key = "logs.manage")]
    LogsManage,
}

impl Permission {
    const fn key_str(self) -> &'static str {
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
            Self::PagesRead => "pages.read",
            Self::PagesManage => "pages.manage",
            Self::CreditsRead => "credits.read",
            Self::CreditsManage => "credits.manage",
            Self::CreditTransactionsRead => "credit_transactions.read",
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
            Self::PagesRead | Self::PagesManage => "pages",
            Self::CreditsRead | Self::CreditsManage => "credits",
            Self::CreditTransactionsRead => "credit_transactions",
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
            | Self::PagesRead
            | Self::CreditsRead
            | Self::CreditTransactionsRead
            | Self::LogsRead => "read",
            Self::AdminsManage
            | Self::UsersManage
            | Self::CountriesManage
            | Self::SettingsManage
            | Self::PagesManage
            | Self::CreditsManage
            | Self::LogsManage => "manage",
        }
    }

    pub const fn implied_permission(self) -> Option<Self> {
        match self {
            Self::AdminsManage => Some(Self::AdminsRead),
            Self::UsersManage => Some(Self::UsersRead),
            Self::CountriesManage => Some(Self::CountriesRead),
            Self::SettingsManage => Some(Self::SettingsRead),
            Self::PagesManage => Some(Self::PagesRead),
            Self::CreditsManage => Some(Self::CreditsRead),
            Self::LogsManage => Some(Self::LogsRead),
            _ => None,
        }
    }
}

impl From<Permission> for PermissionId {
    fn from(value: Permission) -> Self {
        PermissionId::new(value.key_str())
    }
}

impl AsRef<str> for Permission {
    fn as_ref(&self) -> &str {
        self.key_str()
    }
}

#[cfg(test)]
mod tests {
    use super::Permission;
    use forge::ForgeAppEnum;

    #[test]
    fn parse_recognizes_observability_view() {
        assert_eq!(
            Permission::parse_key("observability.view"),
            Some(Permission::ObservabilityView)
        );
    }

    #[test]
    fn variants_include_observability_view() {
        assert!(crate::types::app_enum::enum_variants::<Permission>()
            .contains(&Permission::ObservabilityView));
    }
}
