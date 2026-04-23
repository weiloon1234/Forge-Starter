use serde::Serialize;
use ts_rs::TS;

#[derive(Serialize, TS, forge::ApiSchema)]
#[ts(export)]
pub struct BadgeCountsResponse {
    #[ts(type = "Record<string, number>")]
    pub counts: serde_json::Value,
}
