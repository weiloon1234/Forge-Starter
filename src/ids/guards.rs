use forge::prelude::*;

#[derive(Clone, Copy, ForgeId)]
#[forge(id = GuardId, rename_all = "snake_case")]
pub enum Guard {
    User,
    Admin,
}
