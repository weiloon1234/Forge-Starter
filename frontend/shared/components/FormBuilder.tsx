import type { FormBuilderProps } from "../types/form";
import { FormField } from "./FormField";

export function FormBuilder<T extends Record<string, any>>({
  form,
  fields,
  submitLabel = "Submit",
  className,
}: FormBuilderProps<T>) {
  return (
    <form onSubmit={form.handleSubmit} className={className}>
      {fields.map((config) => (
        <FormField
          key={config.name}
          config={config}
          binding={form.field(config.name as keyof T)}
        />
      ))}
      <button type="submit" className="sf-button" disabled={form.busy}>
        {form.busy ? "..." : submitLabel}
      </button>
    </form>
  );
}
