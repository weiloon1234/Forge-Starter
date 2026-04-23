---
name: frontend-form
description: Use when building a form anywhere in the frontend — inside a modal, on a full page, as a wizard step, or a settings panel. Typical phrasings: "add a form for X", "settings form", "profile form", "multi-step wizard", "form modal for create/edit Y", "confirm action dialog". Covers `useForm` wiring + `@shared/components` field composition + `modal.open` for form modals + 422 error auto-wiring + submit / cancel / delete button patterns. Do NOT use for: the full admin CRUD-page flow (that's `admin-datatable`, which invokes this for its form modal); picking which shared component to use (`shared-components` — consult that for field-type → primitive mapping); building a `<DataTable>` column filter (not a form, that's the datatable's built-in filter system); auth login/refresh forms (those ship as part of `new-portal`).
---

# Frontend Form — build a form anywhere

## When to invoke

A developer needs a form UI in any context. Typical phrasings:

- "add a create-user modal form"
- "settings page with a form"
- "edit profile form"
- "multi-step signup wizard"
- "confirm delete dialog"
- "form to change password"
- "page form for X with save + cancel"

Do NOT invoke for:
- **The whole admin CRUD flow** — use `admin-datatable`. It invokes this skill for its form modal; you don't invoke both.
- **Picking which `@shared/components` primitive matches a field type** — consult `shared-components` (the catalog) for the Input / Select / DatePicker / FileUpload decision.
- **Column filters on a datatable** — not a form; the datatable system's `available_filters()` on the Rust side handles those.
- **Auth login / refresh forms** — those are scaffolded by `new-portal` as part of the portal template.

## Concept

Every form in the frontend uses `useForm` from `@shared/hooks`. It owns the form's value state, error state, dirty tracking, and busy flag, and it auto-wires 422 validation errors from the API to the right fields. You never hand-roll `useState` for form fields; you never catch 422s manually; you never build a custom error banner.

Fields are composed from `@shared/components` primitives — `<Input>`, `<Select>`, `<Checkbox>`, `<Radio>`, `<FileUpload>`, `<DatePicker>`, etc. — each spread with `{...form.field("key")}` to bind. Submission happens by invoking `form.handleSubmit` (not by `<form onSubmit>` — native form submission is unused; submission is triggered via a Save button's `onClick`).

Forms live in three containers:

1. **Modal form** — launched via `modal.open(Component, props, { title })`. Body wrapped in `<ModalBody>`, buttons in `<ModalFooter>`. Most admin CRUD work uses this.
2. **Page form** — rendered directly inside a page component. Settings, profile, complex single-record edit pages.
3. **Wizard step** — a sequence of forms advancing through a multi-step flow, each step validating + committing before the next.

## Prerequisites

- [ ] `@shared/hooks`, `@shared/components`, `@shared/modal` are already available in the portal. They always are — don't install anything.
- [ ] If the form submits to the API, the backend route + request/response DTOs exist (create/update these via the flow that owns them — `admin-datatable` / `admin-page` / `new-portal`).
- [ ] If the form uses enum-typed fields, the enum already exists under `src/domain/enums/` and has been regenerated into TS via `make types`. See `typescript` skill.
- [ ] If field labels are new user-facing strings, the i18n keys exist in `locales/<lang>/messages.json` (per CLAUDE.md Translation Rules).

## Decisions — answer ALL before writing code

1. **Container** — modal, page, or wizard step?
2. **Mode** — create-only, edit-only, create-OR-edit (same form handles both), or submit-only (no persistence, e.g., search form)?
3. **Fields** — list each field with its Rust DTO field name, its frontend display label (i18n key), and the matching `@shared/components` primitive (consult `shared-components`).
4. **Submit pattern** — API POST / PUT / custom endpoint / pure client-side handler?
5. **Validation** — backend-side (422 auto-wired, default) or supplementary client-side (for offline / pre-API checks)?
6. **FormBuilder vs explicit composition** — if the field list is flat and schema-describable, `FormBuilder` saves code; if there's conditional fields / multi-column layout / mixed widgets, explicit composition wins.
7. **Cancel / close behavior** — modal: `onClose`; page: router navigate; wizard: previous step.
8. **Delete / destructive action** — if edit mode supports delete, opens a separate confirmation modal (sub-modal of the form modal, or a full-page confirm for page forms).
9. **Multi-step** — single-step (default) or wizard (decide total steps + gate between them).

Present these to the user. Confirm. Then proceed.

## Core steps

### 1. Decide the values type — default to the generated Request

The DTO is simultaneously the backend validation target, the wire contract, the TypeScript type, and the form's value type. **Default: type the form against the generated Request directly** (see `frontend/CLAUDE.md` "DTOs — one struct, four roles"). No hand-written `FormValues` interface unless you have a specific reason.

```tsx
import type { Create<Feature>Request } from "@shared/types/generated";

// useForm's values IS already Create<Feature>Request — no intermediate type:
const form = useForm<Create<Feature>Request>({ ... });
```

Use a local `FormValues` interface **only when the form carries UI-only state the DTO can't represent**:

- Password + confirm-password (Request has one field, form has two)
- Search-query state feeding `<Select searchable onSearch={...}>` that doesn't submit to the server
- Preview / computed values shown but not sent
- **Unified create-or-edit modals** where `Create<Feature>Request` and `Update<Feature>Request` have different shapes (Update typically has `Option<T>` everywhere) — the form carries a superset and maps to the right Request on submit. This is the canonical case for the CRUD modal template in Variant A below.

Outside those cases, skip the `FormValues` interface. When the exception is justified, put the `FormValues` type plus payload-mapping helpers in a dedicated portal-local adapter file (for example `pageForm.ts`, `credits.ts`, `adminForm.ts`, `userForm.ts`) instead of leaving that mapping logic inline inside the component.

### 2. Set up `useForm`

Default — single-mode form (create-only OR update-only), types directly against the generated Request:

```tsx
import { useForm } from "@shared/hooks";
import { api } from "@/api";
import type { Create<Feature>Request, <Feature>Response } from "@shared/types/generated";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export function <Feature>Form({ onSaved, onClose }: Props) {
  const { t } = useTranslation();
  const form = useForm<Create<Feature>Request>({       // ← binds directly
    initialValues: {
      <field_1>: "",
      <field_2>: "<default>",
      <field_3>: null,
    },
    onSubmit: async (values) => {                       // values IS Create<Feature>Request
      await api.post<<Feature>Response>("/<resource>", values);
      toast.success(t("<feature>.created"));
      onSaved?.();
      onClose?.();
    },
  });

  return <>/* template per variant below */</>;
}
```

For unified create-or-edit modals (Variant A below), a local `FormValues` type is the justified exception — Create/Update DTOs have different shapes, so the form carries a superset.

### 3. Compose fields

Each field is a `@shared/components` primitive with `{...form.field("key")}`. See `shared-components` for the full picker.

```tsx
<Input {...form.field("<field_1>")} label={t("<label>")} />
<Select
  {...form.field("<field_2>")}
  label={t("<label>")}
  options={enumOptions(<YourEnum>Options, t)}
/>
<DatePicker {...form.field("<field_3>")} label={t("<label>")} />
```

### 4. Wire submit + cancel

Buttons live in the container footer (modal, page, wizard). The Save button's `onClick` calls `form.handleSubmit` — no native `<form onSubmit>`:

```tsx
<Button type="button" variant="secondary" onClick={onClose}>
  {t("Cancel")}
</Button>
<Button type="button" busy={form.busy} onClick={form.handleSubmit}>
  {t("Save")}
</Button>
```

## Variant templates

### Variant A — Modal form (canonical form shape)

The most common variant. Used by every admin CRUD page via the `admin-datatable` skill.

```tsx
import { Button, Input } from "@shared/components";
import { useForm } from "@shared/hooks";
import { ModalBody, ModalFooter, modal } from "@shared/modal";
import type {
  Create<Feature>Request,
  Update<Feature>Request,
  <Feature>Response,
} from "@shared/types/generated";
import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/api";
import { Confirm<Feature>DeleteModal } from "@/components/Confirm<Feature>DeleteModal";

interface <Feature>FormValues {
  <field_1>: string;
  <field_2>: string;
}

interface <Feature>FormModalProps {
  <feature>Id?: string;                        // undefined = create, present = edit
  onSaved?: () => void;
  onClose: () => void;
}

export function <Feature>FormModal({
  <feature>Id,
  onSaved,
  onClose,
}: <Feature>FormModalProps) {
  const { t } = useTranslation();
  const isCreate = !<feature>Id;
  const [loading, setLoading] = useState(!isCreate);
  const [loaded, setLoaded] = useState<<Feature>Response | null>(null);

  const form = useForm<<Feature>FormValues>({
    initialValues: { <field_1>: "", <field_2>: "" },
    onSubmit: async (values) => {
      if (isCreate) {
        const payload: Create<Feature>Request = {
          <field_1>: values.<field_1>,
          <field_2>: values.<field_2>,
        };
        await api.post("/<feature>s", payload);
        toast.success(t("<feature>s.created"));
      } else if (<feature>Id) {
        const payload: Update<Feature>Request = {
          <field_1>: values.<field_1> || null,
          <field_2>: values.<field_2> || null,
        };
        await api.put(`/<feature>s/${<feature>Id}`, payload);
        toast.success(t("<feature>s.updated"));
      }
      onSaved?.();
      onClose();
    },
  });

  // Preload existing record in edit mode
  useEffect(() => {
    if (!<feature>Id) return;
    (async () => {
      try {
        const { data } = await api.get<<Feature>Response>(`/<feature>s/${<feature>Id}`);
        setLoaded(data);
        form.setValues({
          <field_1>: data.<field_1>,
          <field_2>: data.<field_2>,
        });
      } catch {
        onClose();   // API errors already toast via interceptor
      } finally {
        setLoading(false);
      }
    })();
  }, [<feature>Id, form, onClose]);

  if (loading) return <ModalBody>{t("Loading")}</ModalBody>;

  const handleDelete = () => {
    if (!loaded) return;
    modal.open(
      Confirm<Feature>DeleteModal,
      {
        name: loaded.<display_field>,
        onConfirm: async () => {
          await api.delete(`/<feature>s/${loaded.id}`);
          toast.success(t("<feature>s.deleted"));
          onSaved?.();
          onClose();
        },
      },
      { title: t("Delete") },
    );
  };

  return (
    <>
      <ModalBody>
        <Input {...form.field("<field_1>")} label={t("<label_1>")} />
        <Input {...form.field("<field_2>")} label={t("<label_2>")} />
      </ModalBody>

      <ModalFooter>
        {!isCreate && loaded && (
          <Button
            type="button"
            variant="danger"
            size="sm"
            prefix={<Trash2 size={16} />}
            onClick={handleDelete}
          >
            {t("Delete")}
          </Button>
        )}
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button type="button" size="sm" busy={form.busy} onClick={form.handleSubmit}>
          {t("Save")}
        </Button>
      </ModalFooter>
    </>
  );
}
```

Open from a parent component:
```tsx
modal.open(<Feature>FormModal, { onSaved: () => refresh() }, { title: t("Create <Feature>") });
modal.open(<Feature>FormModal, { <feature>Id: row.id, onSaved: () => refresh() }, { title: t("Edit <Feature>") });
```

### Variant B — Page form (settings / profile / single-record edit)

```tsx
import { Button, Input } from "@shared/components";
import { useForm } from "@shared/hooks";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/api";
import type { <Feature>Response, Update<Feature>Request } from "@shared/types/generated";

export function <Feature>FormPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);

  const form = useForm({
    initialValues: { <field_1>: "", <field_2>: "" },
    onSubmit: async (values) => {
      const payload: Update<Feature>Request = { ...values };
      const { data } = await api.put<<Feature>Response>("/<resource>", payload);
      form.setValues({ <field_1>: data.<field_1>, <field_2>: data.<field_2> });
      toast.success(t("<feature>.updated"));
    },
  });

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<<Feature>Response>("/<resource>");
        form.setValues({ <field_1>: data.<field_1>, <field_2>: data.<field_2> });
      } finally {
        setLoading(false);
      }
    })();
  }, [form]);

  if (loading) return null;

  return (
    <div>
      <h1 className="sf-page-title">{t("<feature>.title")}</h1>
      <p className="sf-page-subtitle">{t("<feature>.subtitle")}</p>

      <div className="mt-4 space-y-4">
        <Input {...form.field("<field_1>")} label={t("<label_1>")} />
        <Input {...form.field("<field_2>")} label={t("<label_2>")} />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => form.reset()}
            disabled={!form.isDirty}
          >
            {t("Reset")}
          </Button>
          <Button
            type="button"
            size="sm"
            busy={form.busy}
            disabled={!form.isDirty}
            onClick={form.handleSubmit}
          >
            {t("Save changes")}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

Key differences from modal:
- No `<ModalBody>` / `<ModalFooter>` wrappers.
- Cancel button becomes `Reset` (reverts unsaved edits); dirty-gating disables Save when nothing changed.
- Load-on-mount instead of load-on-open.

### Variant C — Confirm action modal (destructive or commit)

Used for delete confirmations, publish confirmations, any "are you sure" moment. Wraps a single-shot action, not a multi-field form.

```tsx
import { Button } from "@shared/components";
import { ModalBody, ModalFooter } from "@shared/modal";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface Confirm<Action>ModalProps {
  name: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function Confirm<Action>Modal({
  name,
  onConfirm,
  onClose,
}: Confirm<Action>ModalProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ModalBody>
        <p>{t("<feature>.confirm_<action>", { name })}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" size="sm" onClick={onClose} disabled={busy}>
          {t("Cancel")}
        </Button>
        <Button variant="danger" size="sm" busy={busy} onClick={handleConfirm}>
          {t("<Action>")}
        </Button>
      </ModalFooter>
    </>
  );
}
```

No `useForm` needed — this is a single async action, not a field-bearing form. `busy` is local `useState`.

### Variant D — Multi-step wizard skeleton

When a form needs >3 logical sections, break into steps. Each step is its own component holding its own `useForm`; the wizard parent tracks current step + accumulated values.

```tsx
import { Button } from "@shared/components";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface WizardValues {
  step1: { <field>: string };
  step2: { <field>: string };
  step3: { <field>: string };
}

export function <Feature>Wizard({ onComplete }: { onComplete: (v: WizardValues) => Promise<void> }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [values, setValues] = useState<Partial<WizardValues>>({});

  const advance = (stepValues: WizardValues[keyof WizardValues]) => {
    const key = `step${step}` as keyof WizardValues;
    setValues((v) => ({ ...v, [key]: stepValues }));
    if (step < 3) setStep((s) => (s + 1) as 1 | 2 | 3);
    else void onComplete({ ...values, [key]: stepValues } as WizardValues);
  };

  return (
    <div>
      <WizardProgress current={step} total={3} />
      {step === 1 && <Step1Form initial={values.step1} onNext={advance} />}
      {step === 2 && (
        <Step2Form initial={values.step2} onBack={() => setStep(1)} onNext={advance} />
      )}
      {step === 3 && (
        <Step3Form initial={values.step3} onBack={() => setStep(2)} onSubmit={advance} />
      )}
    </div>
  );
}

// Each Step<N>Form is an independent form component using useForm, with its own
// <Input>/<Select>/etc fields and a "Next" (or "Submit" on the last step) button
// calling onNext(values). Back button simply setStep(prev).
```

Wizards get heavy quickly — defer them until the flow genuinely has >3 logical steps. Two-step flows fit in a single modal with conditional field visibility.

## Field → component picker (quick reference)

Consult `shared-components` for the authoritative catalog. Common picks:

| Field kind | Component | Spread |
|---|---|---|
| Single-line text / email / password / number | `<Input type="...">` | `{...form.field("key")}` |
| Money (decimal) | `<Input type="money">` | same |
| Multi-line text | `<Input type="textarea">` | same |
| Enum dropdown | `<Select options={enumOptions(...)}>` | same |
| Async / remote options | `<Select searchable onSearch={...} loading={...}>` | same |
| Boolean | `<Checkbox>` | same |
| Multi-boolean from options | `<CheckboxGroup options={...}>` | same |
| Mutually-exclusive from options | `<Radio options={...}>` | same |
| File / image | `<FileUpload accept="...">` | same |
| Date / time / combined | `<DatePicker>` / `<TimePicker>` / `<DateTimePicker>` | same |

Every control takes `label`, `placeholder`, `disabled`, and `className` additional props as needed. See `shared-components` for full prop surface.

## FormBuilder — when the field list is schema-shaped

If the fields are flat, known, and repetitive, `FormBuilder` saves boilerplate:

```tsx
import { FormBuilder } from "@shared/components";

<FormBuilder
  schema={[
    { key: "name", type: "text", label: t("Name") },
    { key: "email", type: "email", label: t("Email") },
    { key: "plan", type: "select", label: t("Plan"), options: planOptions },
  ]}
  initialValues={initial}
  onSubmit={handler}
/>
```

Prefer explicit composition when layout is multi-column, conditional, or when a field needs custom wrapping / side-effects. The rule of thumb: if you can describe the form as a flat JSON array, use `FormBuilder`; otherwise use `<Input>` / `<Select>` directly.

## Verify

```bash
make lint       # Biome on the new file
make types      # only needed if new DTO / enum references changed
```

Then manual smoke:
1. Open the form (render the page / launch the modal).
2. Submit with missing required fields → backend returns 422 → errors appear inline under each field automatically.
3. Submit valid values → toast success, form resets (or modal closes).
4. Submit while server is slow → Save button shows busy / spinner state; fields disable.

## Don't

- **Don't build custom form state with `useState`.** `useForm` is mandatory for any field-bearing form.
- **Don't catch 422 errors yourself.** `useForm` auto-maps field errors. Catching swallows the wiring.
- **Don't wrap the form in a native `<form>` with `onSubmit`.** Submission triggers from the Save button's `onClick={form.handleSubmit}`. Native form submission on Enter key is handled by `useForm` internally if configured — don't duplicate.
- **Don't render raw HTML controls.** `<button>`, `<input>`, `<select>`, `<textarea>` are banned. Every control goes through `@shared/components`. See `shared-components` for the catalog.
- **Don't manage a toast for API errors.** Axios interceptors auto-toast non-2xx. The only manual toast you write is the success toast in `onSubmit`.
- **Don't pre-hash passwords on the frontend.** The backend model's `write_mutator` hashes at save. Send plaintext.
- **Don't put delete confirmation inside the same modal as the form.** Open a separate `ConfirmDeleteModal` via `modal.open(...)` — keeps destructive UX consistent across the app.
- **Don't skip i18n.** Every `label`, `placeholder`, toast text, confirmation string uses `t("key")`. No raw English strings.
- **Don't mount more than one `ModalProvider`.** It's already mounted once in each portal's `App.tsx`. Don't re-mount.

## When this skill doesn't fit

- **Full admin CRUD page** — use `admin-datatable` (it invokes this skill for its form modal).
- **Login / refresh / logout UI** — part of `new-portal`'s scaffold.
- **Datatable column filter** — not a form; the datatable's `available_filters()` (Rust side) + built-in UI handles it. See `admin-datatable`.
- **Search box not tied to a form** — `useState` + `useDebounce` + `api.get("...?q=...")` is fine. Not every input is a form.
- **Picking the right `@shared/components` primitive** — consult `shared-components`.
