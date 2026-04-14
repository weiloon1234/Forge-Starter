use forge::prelude::*;

#[derive(Clone, Copy)]
pub enum Guard {
    User,
    Admin,
}

impl From<Guard> for GuardId {
    fn from(v: Guard) -> Self {
        match v {
            Guard::User => GuardId::new("user"),
            Guard::Admin => GuardId::new("admin"),
        }
    }
}
