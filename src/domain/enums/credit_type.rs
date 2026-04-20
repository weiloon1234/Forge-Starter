#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, forge::AppEnum, ts_rs::TS)]
#[ts(export)]
pub enum CreditType {
    #[forge(key = "credit_1")]
    Credit1,
    #[forge(key = "credit_2")]
    Credit2,
    #[forge(key = "credit_3")]
    Credit3,
    #[forge(key = "credit_4")]
    Credit4,
    #[forge(key = "credit_5")]
    Credit5,
    #[forge(key = "credit_6")]
    Credit6,
}

impl CreditType {
    pub const fn all() -> [Self; 6] {
        [
            Self::Credit1,
            Self::Credit2,
            Self::Credit3,
            Self::Credit4,
            Self::Credit5,
            Self::Credit6,
        ]
    }

    pub const fn as_key(self) -> &'static str {
        match self {
            Self::Credit1 => "credit_1",
            Self::Credit2 => "credit_2",
            Self::Credit3 => "credit_3",
            Self::Credit4 => "credit_4",
            Self::Credit5 => "credit_5",
            Self::Credit6 => "credit_6",
        }
    }

    pub const fn label_key(self) -> &'static str {
        match self {
            Self::Credit1 => "admin.credits.credit_types.credit_1",
            Self::Credit2 => "admin.credits.credit_types.credit_2",
            Self::Credit3 => "admin.credits.credit_types.credit_3",
            Self::Credit4 => "admin.credits.credit_types.credit_4",
            Self::Credit5 => "admin.credits.credit_types.credit_5",
            Self::Credit6 => "admin.credits.credit_types.credit_6",
        }
    }
}

impl std::fmt::Display for CreditType {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_key())
    }
}
