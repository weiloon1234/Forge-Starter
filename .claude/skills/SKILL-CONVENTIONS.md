# Starter Skill Conventions

How project-level skills in this starter are structured. Read this before creating or editing any `.claude/skills/*/SKILL.md`. The goal is consistent DX: a future LLM finds the right skill, the skill forces the right decisions, and code that lands is indistinguishable from what a human reviewer would produce.

Skills live under `.claude/skills/<skill-name>/` and travel with the repo. When the starter is forked or copied, the skills go with it — so every project derived from this starter inherits the same development discipline.

## Complexity tiers

Pick the tier based on the variability of the pattern, not its importance. The tier determines file structure and skill shape.

### Tier 1 — Uniform pattern

A single predictable flow. Every invocation touches the same files in the same order with near-identical code shape. Examples: `admin-badge`, `new-permission`, `new-scheduled-job`, `new-channel`.

Structure:
```
.claude/skills/<name>/
└── SKILL.md        ~100-200 lines
```

The entire flow is inline in `SKILL.md`. No sub-files, no branches of significance. The skill enumerates 3–5 edits, shows the exact template for each, and runs verification.

### Tier 2 — Variable shape with common extensions

Same core concept, but many optional dimensions. Decision matters before code lands. Examples: `admin-datatable`, `new-model-with-relations`, `admin-wizard-page`.

Structure:
```
.claude/skills/<name>/
├── SKILL.md              ~300-500 lines (decision guide + core + common extensions inline)
├── references/           (rare: advanced variants, loaded lazily via Read)
│   └── <feature>.md
└── examples/             (complete worked samples for common variants)
    └── <variant>.md
```

`SKILL.md` starts with a mandatory **decision guide** that must be answered before any code is generated. Core steps (always run) are inline. Common extensions (filters, modals, actions) are inline under named subsections. Rare extensions (bulk actions, custom renderers, non-default permission patterns) live in `references/` and are loaded via Read only when the decision guide surfaces the need.

`examples/` contains full worked samples keyed to the variant the user chose — the LLM reads the matching example file when unsure of layout.

### Tier 3 — Cross-subsystem workflow

Spans many Tier-1/Tier-2 skills, requires sequencing. Examples: `add-new-portal` (touches routing + auth + middleware + config + frontend bootstrap + menus), `migrate-soft-delete-to-archive-pattern`.

Structure:
```
.claude/skills/<name>/
├── SKILL.md              orchestrates by invoking other skills in order
└── references/
    └── <cross-cutting-concern>.md
```

`SKILL.md` is short — primarily a sequenced list of child skills to invoke and the information to pass between them. It does not contain templates directly; those live in the child skills. Reserve Tier 3 for genuinely cross-cutting work; most features fit Tier 1 or 2.

## Shared structure — every SKILL.md

Every skill, regardless of tier, uses the same top-level section shape:

```markdown
---
name: <kebab-case-name>
description: <trigger description — see below>
---

# <Human Readable Name> — <one-line what-it-does>

## When to invoke

[positive trigger phrases + explicit "do NOT use for" list]

## Concept

[one paragraph — what this is, pointers to CLAUDE.md / spec if relevant]

## Prerequisites

[checklist of artifacts that must exist before the skill runs —
 e.g., the model, the permission, the enum variant. If missing, the skill
 refers to the skill that creates them, rather than doing it inline.]

## [Decision guide — Tier 2+ only]

[mandatory questions the LLM must answer with the user before generating
 any code. Structured as explicit bullets.]

## Steps

[numbered steps with exact file paths + code templates]

## [Extensions — Tier 2+ only]

[named subsections for common variants, inline code where feasible,
 pointer to references/ for rare cases]

## Verify

[exact commands in order, expected output]

## Don't

[explicit anti-patterns — stringly-typed, manual publishes, skipping
 steps, etc. This section is required, not optional.]

## When this skill doesn't fit

[routing to adjacent skills when the user's request is close-but-different]
```

## Frontmatter — description field

The `description` is the single biggest lever on trigger accuracy. Write it so that:

1. **Concrete trigger phrasings lead.** Quote realistic user prompts: `"add a pending X badge"`, `"show count for pending KYC"`.
2. **Explicit scope limits follow.** State negatives: `"Do NOT use for Forge user notifications (outbound messages), dashboard metrics, or generic counters."`
3. **Scope is named by concept, not by files.** A user asking for behavior doesn't know which file holds it.
4. **One line is too short; a paragraph is usually right.** 2–5 sentences with 3–5 concrete example phrasings.
5. **Mention the layers the skill covers.** e.g., `"covers both backend AdminBadge trait and frontend MenuItem wiring"` — so cross-layer skills are clearly whole-feature.

Test: read only the description and ask yourself "would I know when to invoke this?" If no, rewrite.

## Decision guide — Tier 2+ discipline

Before any code is generated, a Tier-2+ skill MUST walk the user through a decision guide. The shape:

```markdown
## Decisions — answer ALL before writing code

1. **<Axis 1>**: <concrete choices>
2. **<Axis 2>**: <concrete choices>
...

Present these to the user. If any answer is unclear or indicates a
non-standard variant, stop and ask. Do NOT proceed to Steps on guess.
```

The guide is a gate, not a suggestion. Common axes across Tier-2 skills: which model, which shape variant, which filters, which permissions, which UI layout, which extensions. The guide exists to prevent the "LLM generates 400 lines then user says 'wrong shape'" failure mode.

## Inline vs references vs examples

Three ways to capture variant information, used in this order:

- **Inline in SKILL.md**: for common variants (~80% of invocations use this shape). Keeps context loaded eagerly, minimizes file reads.
- **`references/<topic>.md`**: for advanced or rare extensions (bulk actions, CSV export, multi-tenant scoping, custom renderers). The main `SKILL.md` explicitly instructs the LLM to Read the reference when the decision guide surfaces the need. Keeps the main skill file compact.
- **`examples/<variant>.md`**: for complete worked samples. Use when showing the assembled shape of a variant is clearer than fragmenting it across the main skill's extension sections. Read-only reference material, not a procedure — "look at this when uncertain".

Rule of thumb: if adding inline would push `SKILL.md` past ~500 lines, extract to `references/`. If a variant's layout is best shown end-to-end rather than as delta-edits, put it in `examples/`.

## Strongly-typed discipline

Every skill in this starter enforces strongly-typed code across layers. Templates MUST use:

| Layer | Strongly-typed form | Anti-pattern to forbid |
|---|---|---|
| Model columns | `Admin::USERNAME`, `TopUp::STATUS` | `"username"`, `"status"` string literals |
| Enum values | `AdminType::Developer`, `TopUpStatus::Pending` | `"developer"`, `"pending"` string literals |
| Permissions | `Permission::AdminsManage` | `"admins.manage"` string literals |
| Model references | `type Watches: forge::Model`, `Admin::query()` | `.query_table("admins")` or similar |
| IDs | `ModelId<Self>` | raw `String` IDs in structs |
| Channels | `ChannelId::new("admin:badges")` consts in `src/ids/channels.rs` | inline `"admin:badges"` strings |
| Menu keys / routes | typed helpers where they exist; match existing idiom | arbitrary string paths |

Every skill's "Don't" section must explicitly forbid stringly-typed shortcuts for the domain it covers. The Forge derive macros (`forge::Model`, `forge::AppEnum`) exist specifically to enable this discipline — use them.

## "Don't" section — always include

Every skill ends with an explicit anti-pattern list, not just a positive procedure. Minimum contents:

- Layer-specific stringly-typed anti-patterns (see table above)
- "Don't duplicate logic across REST + WS + other endpoints" — one source of truth per concept
- "Don't skip the permission gate" — every admin-facing surface has a permission check
- "Don't install new dependencies without asking" — CLAUDE.md rule
- Skill-specific traps (e.g., badges: "don't manually publish after mutations"; datatables: "don't bypass the generic /datatables/*/query endpoint")

A skill without a "Don't" section is incomplete. The positive procedure tells future LLMs what to do; the "Don't" section tells them what *not* to do when they feel clever.

## "When this skill doesn't fit" — routing

Every skill ends by routing adjacent-but-different requests to the right place. Examples:

- `admin-badge` → "For user-facing notifications, use `forge::Notification` (separate system)."
- `admin-datatable` → "For a wizard / multi-step form, use `admin-wizard-page` (separate skill)."
- `admin-datatable` → "For a read-only single-row detail page, use `admin-detail-page` (separate skill)."

This prevents a skill from being wrongly stretched to cover a nearby concept where the file structure genuinely differs. If a routing target doesn't exist yet, say so — `"no skill yet; escalate to the human"` is a valid route.

## Naming conventions

- Skill directory: `admin-<feature>`, `new-<concept>`, or `add-<thing>`. Prefer feature-named (`admin-badge`) over verb-named (`add-badge`) because users ask for the concept, not the action. Kebab-case.
- Frontmatter `name`: matches directory name exactly.
- File within the skill: `SKILL.md` at the root, `references/<topic>.md` and `examples/<variant>.md` with kebab-case names.
- Internal placeholders in code templates: `<YourThing>` angle-bracketed; grep-friendly for "what's left to fill in".

## Progressive disclosure — don't pre-load everything

A project SKILL.md is eagerly loaded when invoked. Keep it focused. Use these tools to push detail out of eager context:

- **References** (lazy, explicit Read): advanced variants.
- **Examples** (lazy, explicit Read): complete worked samples.
- **Pointers to CLAUDE.md / spec files / module docstrings**: for deep-dive background not needed for execution.

If a reader needs to understand a section to do the work, inline it. If they might *want* to read it to understand *why*, link to it. The skill executes; the docs explain.

## Template file

Copy this when starting a new skill:

```markdown
---
name: <skill-name>
description: Use when <trigger>. Typical phrasings: "<example 1>", "<example 2>". Covers <layers>. Do NOT use for <explicit negative 1>, <explicit negative 2>.
---

# <Human Readable Name> — <one-line purpose>

## When to invoke

[positive + negative]

## Concept

[one paragraph + deeper references]

## Prerequisites

- [ ] <artifact 1>
- [ ] <artifact 2>

## Decisions — answer before writing code  [Tier 2+ only]

1. **<Axis>**: <choices>
...

## Steps

### 1. <Step name>
Path: `<file>`
[template code]

### 2. <Step name>
...

## Extensions  [Tier 2+]

### If <variant>
[inline steps]

### If <rare variant>
Read `./references/<topic>.md` for this pattern.

## Verify

```bash
make check
make lint
make types
```

## Don't

- [anti-pattern 1]
- [anti-pattern 2]

## When this skill doesn't fit

- [adjacent concept] → [skill name or escalate]
```

## Meta: what changes when adding a skill

When a new skill lands:

1. Create `.claude/skills/<name>/SKILL.md` following this document.
2. For Tier 2+, create the `references/` and `examples/` subdirectories at the same time (empty is fine — add entries as real variants surface).
3. Do NOT edit CLAUDE.md per-skill. When the skill count reaches ~4–5, do a single refactor pass to add a "Skills" section to CLAUDE.md that indexes them all — amortizing the doc churn.
4. If the skill is strictly better than an existing pattern in CLAUDE.md (e.g., `admin-badge` supersedes the informal "add a badge" instructions already there), leave CLAUDE.md as a pointer: `"see .claude/skills/admin-badge/SKILL.md for the procedure"` — don't duplicate.

## Questions to ask before writing any new skill

1. What tier? If unsure, it's probably Tier 2.
2. What are the decision axes? If there are none, it might be Tier 1.
3. What adjacent skills exist? Write the "When this skill doesn't fit" routing list first — it forces clarity on scope.
4. What templates do I need? Write them next, verifying against real existing code in the starter.
5. What anti-patterns do I want to forbid? Write the "Don't" section explicitly.
6. What references or examples will this skill need? Create the directories; add placeholders or leave empty.

Only after answering all six should the procedural "Steps" get written. Steps are the last thing to write, not the first — the shape of the skill is determined by everything else.
