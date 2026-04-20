# Forge Follow-Ups

Framework-level improvements that should move upstream so downstream apps do not need local workarounds.

## Resolved Upstream

- Forge now ships `JsonValidated<T>` for JSON-only validated extraction.
- Forge now supports translated request-body and content-type failures through the validation message pipeline.
- Forge now provides a default `Authenticatable::resolve_from_actor` path for the common primary-key case.
- Forge now exports shared token-auth DTOs such as `RefreshTokenRequest` and `MessageResponse`.
- Forge now exports a shared `WsTokenResponse` helper for token-auth portals.
- Forge now preserves token abilities when refreshing scoped token pairs.
- Forge now exports stronger datatable metadata types cleanly to TypeScript, including the generator fixes previously applied downstream.
- Forge auth errors now carry specific human-readable messages plus `error_code` and `message_key` metadata through the generic `Error` path.
- Forge now ships the higher-level route scope DSL with inheritable `name_prefix`, `tag`, `guard`, and `permission`, plus simple verb helpers (`get/post/put/delete`) and a route builder with `summary/request/response/public/guard/permission`. Both portals use this DSL throughout.

## Validation

- `forge::Validate` derive rejects fields of type `Option<serde_json::Value>` — it currently infers those as `Option<String>` and fails type check. Until fixed, requests with arbitrary-JSON fields (e.g. `UpdateSettingValueRequest`) must use a manual `impl RequestValidator` with an empty body even when no field-level validation is needed.

## Common Responses

- Consider framework-provided typed success helpers for small token wrapper payloads beyond `MessageResponse`.
