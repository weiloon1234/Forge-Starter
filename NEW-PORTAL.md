# Adding a New Portal

Example: adding a `merchant` portal.

## 1. Copy an existing portal

```bash
cp -r frontend/user frontend/merchant
```

## 2. Update package.json

```json
{
  "name": "forge-starter-merchant"
}
```

## 3. Update vite.config.ts

```ts
base: "/merchant/",
build: {
  outDir: "../../public/merchant",
},
server: {
  port: 5175,
  proxy: {
    "/merchant": "http://localhost:3000",
  },
},
```

## 4. Update index.html

```html
<title>Merchant Portal — Forge Starter</title>
```

## 5. Register in frontend/tsconfig.json

```json
{
  "references": [
    { "path": "admin" },
    { "path": "user" },
    { "path": "merchant" }
  ]
}
```

## 6. Backend changes

See `CLAUDE.md` > "Adding a new portal" for the full backend checklist:

- `src/portals/merchant/` — routes, requests, resources
- `src/ids/guards.rs` — add `Guard::Merchant`
- `src/ids/permissions.rs` — add merchant permissions
- `config/auth.toml` — add `[auth.guards.merchant]`
- `src/domain/models/merchant.rs` — Model + Authenticatable
- `src/portals/mod.rs` — call `merchant::register(r)`
- `src/portals/mod.rs` — add SPA serving for `/merchant` prefix

## 7. Create public output directory

```bash
mkdir -p public/merchant
touch public/merchant/.gitkeep
```

## 8. Update .gitignore

```
public/merchant/*
!public/merchant/.gitkeep
```

## 9. Update Dockerfile

Add to the frontend stage:

```dockerfile
COPY Forge-Starter/frontend/merchant/package.json /app/frontend/merchant/package.json
RUN cd /app/frontend/merchant && npm install
COPY Forge-Starter/frontend/merchant/ /app/frontend/merchant/
RUN cd /app/frontend/merchant && npm run build
```
