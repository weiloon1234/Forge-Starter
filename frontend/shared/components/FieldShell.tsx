import type { FieldBase } from "@shared/types/form";
import type { ReactNode } from "react";
import { FieldMessages, fieldClasses } from "./FieldMessages";

interface FieldShellProps extends Omit<FieldBase, "name"> {
  children: ReactNode;
  hasErrors?: boolean;
  htmlFor?: string;
  labelElement?: "div" | "label";
}

function labelClassName(required: boolean | undefined): string {
  return `sf-label${required ? " sf-label--required" : ""}`;
}

export function FieldShell({
  children,
  label,
  errors,
  hints,
  disabled,
  required,
  className,
  hasErrors,
  htmlFor,
  labelElement = "label",
}: FieldShellProps) {
  const resolvedHasErrors = hasErrors ?? Boolean(errors && errors.length > 0);

  return (
    <div
      className={fieldClasses({
        hasErrors: resolvedHasErrors,
        disabled,
        className,
      })}
    >
      {label &&
        (labelElement === "div" ? (
          <div className={labelClassName(required)}>{label}</div>
        ) : (
          <label className={labelClassName(required)} htmlFor={htmlFor}>
            {label}
          </label>
        ))}

      {children}

      <FieldMessages hints={hints} errors={errors} />
    </div>
  );
}
