#[derive(Clone, Debug, PartialEq, forge::AppEnum, ts_rs::TS)]
#[ts(export)]
pub enum AdminType {
    SuperAdmin,
    Developer,
    Admin,
}

impl std::fmt::Display for AdminType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AdminType::SuperAdmin => write!(f, "super_admin"),
            AdminType::Developer => write!(f, "developer"),
            AdminType::Admin => write!(f, "admin"),
        }
    }
}
