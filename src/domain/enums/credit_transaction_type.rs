#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum, ts_rs::TS)]
#[ts(export)]
pub enum CreditTransactionType {
    #[forge(key = "admin_add")]
    AdminAdd,
    #[forge(key = "admin_deduct")]
    AdminDeduct,
    #[forge(key = "transfer_received")]
    TransferReceived,
    #[forge(key = "transfer_sent")]
    TransferSent,
}

impl CreditTransactionType {
    pub const fn all() -> [Self; 4] {
        [
            Self::AdminAdd,
            Self::AdminDeduct,
            Self::TransferReceived,
            Self::TransferSent,
        ]
    }

    pub const fn as_key(self) -> &'static str {
        match self {
            Self::AdminAdd => "admin_add",
            Self::AdminDeduct => "admin_deduct",
            Self::TransferReceived => "transfer_received",
            Self::TransferSent => "transfer_sent",
        }
    }

    pub const fn label_key(self) -> &'static str {
        match self {
            Self::AdminAdd => "admin.credits.transaction_types.admin_add",
            Self::AdminDeduct => "admin.credits.transaction_types.admin_deduct",
            Self::TransferReceived => "admin.credits.transaction_types.transfer_received",
            Self::TransferSent => "admin.credits.transaction_types.transfer_sent",
        }
    }

    pub const fn default_explanation_key(self) -> &'static str {
        match self {
            Self::AdminAdd => "credits.transactions.admin_add",
            Self::AdminDeduct => "credits.transactions.admin_deduct",
            Self::TransferReceived => "credits.transactions.transfer_received",
            Self::TransferSent => "credits.transactions.transfer_sent",
        }
    }
}

impl std::fmt::Display for CreditTransactionType {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(self.as_key())
    }
}
