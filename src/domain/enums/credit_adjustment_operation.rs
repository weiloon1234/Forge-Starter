#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum, ts_rs::TS)]
#[ts(export)]
pub enum CreditAdjustmentOperation {
    #[forge(key = "add")]
    Add,
    #[forge(key = "deduct")]
    Deduct,
}

impl CreditAdjustmentOperation {
    pub const fn all() -> [Self; 2] {
        [Self::Add, Self::Deduct]
    }

    pub const fn as_key(self) -> &'static str {
        match self {
            Self::Add => "add",
            Self::Deduct => "deduct",
        }
    }
}

impl std::fmt::Display for CreditAdjustmentOperation {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_key())
    }
}
