use serde::Deserialize;

#[derive(Debug, Deserialize, ts_rs::TS, forge::ApiSchema)]
#[ts(export)]
pub struct LogQuery {
    /// Comma-separated list of levels (e.g. `ERROR,WARN`). Empty/None = no filter.
    pub levels: Option<String>,
    /// Default 500, capped at 5000 by the handler.
    pub limit: Option<u64>,
}
