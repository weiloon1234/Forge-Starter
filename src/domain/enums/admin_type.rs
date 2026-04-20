#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum)]
pub enum AdminType {
    SuperAdmin,
    Developer,
    Admin,
}
