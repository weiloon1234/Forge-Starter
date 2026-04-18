#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum, ts_rs::TS)]
#[ts(export)]
pub enum AdminType {
    SuperAdmin,
    Developer,
    Admin,
}

impl AdminType {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::SuperAdmin => "super_admin",
            Self::Developer => "developer",
            Self::Admin => "admin",
        }
    }
}

impl std::fmt::Display for AdminType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}
