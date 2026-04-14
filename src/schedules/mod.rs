use forge::prelude::*;
use crate::ids;

pub fn register(registry: &mut ScheduleRegistry) -> Result<()> {
    registry.daily(ids::schedules::PRUNE_EXPIRED_TOKENS, |inv| async move {
        inv.app().tokens()?.prune(30).await?;
        Ok(())
    })?;

    Ok(())
}
