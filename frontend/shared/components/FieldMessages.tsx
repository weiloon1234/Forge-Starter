import { Children, type ReactNode } from "react";

interface FieldMessagesProps {
  hints?: (string | ReactNode)[];
  errors?: string[];
}

export function FieldMessages({ hints, errors }: FieldMessagesProps) {
  const hasHints = hints && hints.length > 0;
  const hasErrors = errors && errors.length > 0;

  if (!hasHints && !hasErrors) return null;

  return (
    <>
      {hasHints && (
        <div className="sf-hints">
          {Children.map(hints, (hint) => (
            <p className="sf-hint">{hint}</p>
          ))}
        </div>
      )}
      {hasErrors && (
        <div className="sf-errors">
          {Children.map(errors, (err) => (
            <p className="sf-error">{err}</p>
          ))}
        </div>
      )}
    </>
  );
}

export function fieldClasses(opts: {
  hasErrors: boolean;
  disabled?: boolean;
  className?: string;
}): string {
  return [
    "sf-field",
    opts.hasErrors && "sf-field--error",
    opts.disabled && "sf-field--disabled",
    opts.className,
  ]
    .filter(Boolean)
    .join(" ");
}
