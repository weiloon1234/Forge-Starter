# Forge Follow-Ups

These are framework-level improvements discovered while tightening the starter. They should move upstream so new apps do not need local workarounds.

## Resolved Upstream

- Forge now ships `JsonValidated<T>` for JSON-only validated extraction.
- Forge now supports translated request-body and content-type failures through the validation message pipeline.
- Forge now provides a default `Authenticatable::resolve_from_actor` path for the common primary-key case.
- Forge now exports shared token-auth DTOs such as `RefreshTokenRequest` and `MessageResponse`.
- Forge now exports a shared `WsTokenResponse` helper for token-auth portals.
- Forge now preserves token abilities when refreshing scoped token pairs.
- Forge now exports stronger datatable metadata types cleanly to TypeScript, including the starter's previous generator fixes.
- Forge auth errors now carry specific human-readable messages plus `error_code` and `message_key` metadata through the generic `Error` path.

## Routing And API Docs

- Add a higher-level route/resource DSL that can inherit guard, tag, and documentation defaults for a group.
- Reduce repeated `route_named_with_options` ceremony for common resource routes.
- See [FORGE-ROUTE-DSL-PROPOSAL.md](/Users/weiloon/Projects/personal/Rust/Forge-Starter/FORGE-ROUTE-DSL-PROPOSAL.md) for the proposed ideal shape and concrete before/after examples.

## Common Responses

- Consider framework-provided typed success helpers for small token wrapper payloads beyond `MessageResponse`.
