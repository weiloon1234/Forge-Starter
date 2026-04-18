import type { FormBuilderProps } from "@shared/types/form";
import { Button } from "./Button";
import { FormField } from "./FormField";

export function FormBuilder<T extends Record<string, unknown>>({
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
      <Button type="submit" busy={form.busy}>
        {submitLabel}
      </Button>
    </form>
  );
}
