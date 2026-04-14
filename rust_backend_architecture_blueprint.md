# Rust Backend Architecture Blueprint (Scalable, Multi-Portal)

## Overview

This structure is designed for:
- Multi-role / multi-portal systems (admin, user, agent, etc.)
- Clean separation of concerns
- Long-term scalability
- Maintainable business logic boundaries

Architecture style:

**Layered Architecture (Clean Architecture inspired, light DDD influence)**

---

## High-Level Structure

```
app/
├── domains/
├── use_cases/
├── portals/
├── middleware/
├── auth/
├── validation/
├── config/
├── support/
├── state.rs
├── router.rs
└── mod.rs
```

---

## 1. domains/ (Business Layer)

Represents core business modules.

```
domains/
└── merchant/
    ├── model.rs
    ├── repository.rs
    ├── service.rs
    ├── types.rs
    ├── error.rs
    └── mod.rs
```

### Responsibilities
- Business entities
- Core business rules (invariants)
- Database access (repository)
- Domain services

### Examples
- merchant
- user
- product
- order

---

## 2. use_cases/ (Application Layer)

Represents application actions (orchestration layer).

```
use_cases/
└── merchant/
    ├── register_by_user.rs
    ├── register_by_admin.rs
    ├── register_by_agent.rs
    ├── dto.rs
    └── mod.rs
```

### Responsibilities
- Orchestrate domain logic
- Handle actor-specific behavior
- Coordinate multiple domains
- Perform business-level validation

### Example
```
RegisterMerchantByAdmin
```

---

## 3. portals/ (Transport Layer)

Represents entry points grouped by actor/portal.

```
portals/
├── admin/
│   └── merchant/
│       ├── router.rs
│       ├── request.rs
│       ├── response.rs
│       └── mod.rs
├── user/
├── agent/
└── mod.rs
```

### Responsibilities
- HTTP/WebSocket routing
- Request/response DTO
- Input validation (Laravel-style)
- Mapping request → use case input

---

## 4. middleware/

```
middleware/
├── auth.rs
├── admin_only.rs
├── logging.rs
├── rate_limit.rs
└── mod.rs
```

### Responsibilities
- Auth extraction (JWT → Actor)
- Request logging
- Rate limiting
- Guards

### Rule
- NO business logic here

---

## 5. validation/

```
validation/
├── rules/
├── validator.rs
└── error.rs
```

### Responsibilities
- Input validation (format only)

### Examples
- required
- email
- max length

### Rule

**Validate format at the edge, enforce business rules inside.**

---

## 6. auth/

```
auth/
├── actor.rs
├── role.rs
├── permission.rs
├── policy.rs
└── guard.rs
```

### Responsibilities
- Actor identity
- Role definitions
- Permission logic
- Authorization policies

---

## 7. config/

```
config/
├── app.rs
├── database.rs
├── jwt.rs
├── server.rs
├── env.rs
├── loader.rs
└── mod.rs
```

### Responsibilities
- Load `.env`
- Provide structured config

---

## 8. support/

```
support/
├── db.rs
├── response.rs
├── pagination.rs
├── validator.rs
└── mod.rs
```

### Responsibilities
- Shared technical utilities
- NOT business logic

---

## Request Flow

```
HTTP Request
   ↓
Portal (request.rs)
   ↓ validate()
Use Case
   ↓
Domain Service
   ↓
Repository
   ↓
Response DTO
```

---

## Validation Strategy

### Input Validation (Portal Layer)

```
req.validate()?;
```

Checks:
- required
- format
- type

### Business Validation (Use Case / Domain)

Checks:
- uniqueness
- permissions
- ownership rules

---

## DTO Placement Rules

| Type | Location |
|------|--------|
| Request DTO | portals/.../request.rs |
| Response DTO | portals/.../response.rs |
| Internal DTO | use_cases/.../dto.rs |
| Domain Types | domains/.../types.rs |

---

## Naming Conventions

| Concept | Term |
|--------|------|
| Business module | domain |
| Entry surface | portal |
| Caller | actor |
| Permission | role |
| Action | use case |
| Shared logic | service |
| DB access | repository |

---

## Example Use Case Pattern

```
portals/admin/merchant/router.rs
   → validate request
   → map to input
   → use_cases/merchant/register_by_admin
   → domains/merchant/service
   → repository
   → response
```

---

## Key Design Principles

1. Keep domain pure (no transport logic)
2. Keep portal thin (no business logic)
3. Use use_cases for orchestration
4. Separate validation layers
5. Avoid god files (like workflow.rs)

---

## Final Summary

This architecture ensures:

- Clear separation of concerns
- Scalable structure for multi-role systems
- Reusable business logic
- Clean validation boundaries
- Maintainable long-term growth

---

**One-line rule:**

> Request validates shape, use case validates meaning, domain enforces truth.

