#[derive(Clone, Debug, PartialEq, forge::AppEnum, ts_rs::TS)]
#[ts(export)]
pub enum UserStatus {
    Active,
    Inactive,
    Suspended,
}
