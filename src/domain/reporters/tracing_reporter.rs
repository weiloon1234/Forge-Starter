use async_trait::async_trait;
use forge::logging::{
    ErrorReporter, HandlerErrorReport, JobDeadLetteredReport, PanicContext, PanicReport,
};

/// Default starter `ErrorReporter` — forwards every handler error, panic, and
/// dead-lettered job to `tracing::error!(target = "reporter", ...)`.
///
/// Swap this for a vendor integration (Sentry, Honeybadger, Rollbar, …) by
/// registering a different `ErrorReporter` instance in
/// [`AppServiceProvider`](crate::providers::app_service_provider) without
/// changing any call sites.
#[derive(Default)]
pub struct TracingReporter;

#[async_trait]
impl ErrorReporter for TracingReporter {
    async fn report_handler_error(&self, report: HandlerErrorReport) {
        let actor_id = report
            .origin
            .as_ref()
            .and_then(|origin| origin.actor.as_ref())
            .map(|actor| actor.id.clone());
        let actor_guard = report
            .origin
            .as_ref()
            .and_then(|origin| origin.actor.as_ref())
            .map(|actor| actor.guard.as_str().to_string());
        let ip = report
            .origin
            .as_ref()
            .and_then(|origin| origin.ip.map(|ip| ip.to_string()));

        tracing::error!(
            target: "reporter",
            kind = "handler_error",
            method = %report.method,
            path = %report.path,
            status = report.status,
            request_id = ?report.request_id,
            actor_id = ?actor_id,
            actor_guard = ?actor_guard,
            ip = ?ip,
            error = %report.error,
            chain = ?report.chain,
            "handler error reported",
        );
    }

    async fn report_panic(&self, report: PanicReport) {
        let context = describe_panic_context(&report.context);
        tracing::error!(
            target: "reporter",
            kind = "panic",
            message = %report.message,
            location = %report.location,
            context = %context,
            backtrace = ?report.backtrace,
            "panic reported",
        );
    }

    async fn report_job_dead_lettered(&self, report: JobDeadLetteredReport) {
        tracing::error!(
            target: "reporter",
            kind = "job_dead_lettered",
            job_class = %report.job_class,
            job_id = %report.job_id,
            attempts = report.attempts,
            last_error = %report.last_error,
            payload = %report.payload,
            "job dead-lettered",
        );
    }
}

fn describe_panic_context(context: &PanicContext) -> String {
    match context {
        PanicContext::Http {
            request_id,
            method,
            path,
        } => format!(
            "http {method} {path} (request_id={})",
            request_id.as_deref().unwrap_or("-"),
        ),
        PanicContext::Job { id, class } => format!("job {class} (id={id})"),
        PanicContext::Scheduler { id } => format!("scheduler {id}"),
        PanicContext::Other => "other".to_string(),
    }
}
