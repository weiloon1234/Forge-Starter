use forge::prelude::*;
use serde::Serialize;

#[derive(Clone, Serialize)]
pub struct UserRegistered {
    pub user_id: String,
    pub email: String,
}

impl Event for UserRegistered {
    const ID: EventId = EventId::new("user.registered");
}
