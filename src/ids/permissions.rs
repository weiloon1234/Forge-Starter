use forge::prelude::*;

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, forge::AppEnum, ts_rs::TS)]
#[ts(export)]
pub enum Permission {
    #[forge(key = "exports.read")]
    ExportsRead,
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
    #[forge(key = "logs.read")]
    LogsRead,
    #[forge(key = "logs.manage")]
    LogsManage,
}

impl Permission {
    pub const fn all() -> [Self; 9] {
        [
            Self::ExportsRead,
            Self::AdminsRead,
            Self::AdminsManage,
            Self::UsersRead,
            Self::UsersManage,
            Self::CountriesRead,
            Self::CountriesManage,
            Self::LogsRead,
            Self::LogsManage,
        ]
    }

    pub const fn as_key(self) -> &'static str {
        match self {
            Self::ExportsRead => "exports.read",
            Self::AdminsRead => "admins.read",
            Self::AdminsManage => "admins.manage",
            Self::UsersRead => "users.read",
            Self::UsersManage => "users.manage",
            Self::CountriesRead => "countries.read",
            Self::CountriesManage => "countries.manage",
            Self::LogsRead => "logs.read",
            Self::LogsManage => "logs.manage",
        }
    }

    pub const fn module(self) -> &'static str {
        match self {
            Self::ExportsRead => "exports",
            Self::AdminsRead | Self::AdminsManage => "admins",
            Self::UsersRead | Self::UsersManage => "users",
            Self::CountriesRead | Self::CountriesManage => "countries",
            Self::LogsRead | Self::LogsManage => "logs",
        }
    }

    pub const fn action(self) -> &'static str {
        match self {
            Self::ExportsRead
            | Self::AdminsRead
            | Self::UsersRead
            | Self::CountriesRead
            | Self::LogsRead => "read",
            Self::AdminsManage | Self::UsersManage | Self::CountriesManage | Self::LogsManage => {
                "manage"
            }
        }
    }

    pub const fn implied_permission(self) -> Option<Self> {
        match self {
            Self::AdminsManage => Some(Self::AdminsRead),
            Self::UsersManage => Some(Self::UsersRead),
            Self::CountriesManage => Some(Self::CountriesRead),
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
