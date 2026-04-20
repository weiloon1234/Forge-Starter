#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum)]
pub enum CreditTransactionType {
    AdminAdd,
    AdminDeduct,
    TransferReceived,
    TransferSent,
}

impl CreditTransactionType {
    pub const fn default_explanation_key(self) -> &'static str {
        match self {
            Self::AdminAdd => "credits.transactions.admin_add",
            Self::AdminDeduct => "credits.transactions.admin_deduct",
            Self::TransferReceived => "credits.transactions.transfer_received",
            Self::TransferSent => "credits.transactions.transfer_sent",
        }
    }
}
