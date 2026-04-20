#[derive(Clone, Copy, Debug, PartialEq, Eq, forge::AppEnum)]
pub enum CreditAdjustmentOperation {
    Add,
    Deduct,
}
