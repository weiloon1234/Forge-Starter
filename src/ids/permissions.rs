use forge::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, forge::AppEnum)]
#[forge(id_type = PermissionId)]
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
    #[forge(key = "introducer_changes.read")]
    IntroducerChangesRead,
    #[forge(key = "introducer_changes.manage")]
    IntroducerChangesManage,
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
    #[forge(key = "audit_logs.read")]
    AuditLogsRead,
    #[forge(key = "banks.read")]
    BanksRead,
    #[forge(key = "banks.manage")]
    BanksManage,
}

impl Permission {
    pub const fn module(self) -> &'static str {
        match self {
            Self::ExportsRead => "exports",
            Self::ObservabilityView => "observability",
            Self::AdminsRead | Self::AdminsManage => "admins",
            Self::UsersRead | Self::UsersManage => "users",
            Self::IntroducerChangesRead | Self::IntroducerChangesManage => "introducer_changes",
            Self::CountriesRead | Self::CountriesManage => "countries",
            Self::SettingsRead | Self::SettingsManage => "settings",
            Self::PagesRead | Self::PagesManage => "pages",
            Self::CreditsRead | Self::CreditsManage => "credits",
            Self::CreditTransactionsRead => "credit_transactions",
            Self::LogsRead | Self::LogsManage => "logs",
            Self::AuditLogsRead => "audit_logs",
            Self::BanksRead | Self::BanksManage => "banks",
        }
    }

    pub const fn action(self) -> &'static str {
        match self {
            Self::ExportsRead
            | Self::ObservabilityView
            | Self::AdminsRead
            | Self::UsersRead
            | Self::IntroducerChangesRead
            | Self::CountriesRead
            | Self::SettingsRead
            | Self::PagesRead
            | Self::CreditsRead
            | Self::CreditTransactionsRead
            | Self::LogsRead
            | Self::AuditLogsRead
            | Self::BanksRead => "read",
            Self::AdminsManage
            | Self::UsersManage
            | Self::IntroducerChangesManage
            | Self::CountriesManage
            | Self::SettingsManage
            | Self::PagesManage
            | Self::CreditsManage
            | Self::LogsManage
            | Self::BanksManage => "manage",
        }
    }

    pub const fn implied_permission(self) -> Option<Self> {
        match self {
            Self::AdminsManage => Some(Self::AdminsRead),
            Self::UsersManage => Some(Self::UsersRead),
            Self::IntroducerChangesManage => Some(Self::IntroducerChangesRead),
            Self::CountriesManage => Some(Self::CountriesRead),
            Self::SettingsManage => Some(Self::SettingsRead),
            Self::PagesManage => Some(Self::PagesRead),
            Self::CreditsManage => Some(Self::CreditsRead),
            Self::LogsManage => Some(Self::LogsRead),
            Self::BanksManage => Some(Self::BanksRead),
            _ => None,
        }
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
        assert!(crate::domain::enums::enum_variants::<Permission>()
            .contains(&Permission::ObservabilityView));
    }

    #[test]
    fn manage_implies_read_for_introducer_changes() {
        assert_eq!(
            Permission::IntroducerChangesManage.implied_permission(),
            Some(Permission::IntroducerChangesRead)
        );
    }

    #[test]
    fn parse_recognizes_introducer_changes_manage() {
        assert_eq!(
            Permission::parse_key("introducer_changes.manage"),
            Some(Permission::IntroducerChangesManage)
        );
    }
}
