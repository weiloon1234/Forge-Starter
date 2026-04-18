import type {
  FieldBinding,
  UseFormConfig,
  UseFormReturn,
} from "@shared/types/form";
import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractErrorMap(error: unknown): Record<string, string[]> | null {
  if (!isRecord(error) || !isRecord(error.errors)) {
    return null;
  }

  const entries = Object.entries(error.errors).filter(
    ([, messages]) =>
      Array.isArray(messages) &&
      messages.every((message) => typeof message === "string"),
  );

  return entries.length > 0
    ? (Object.fromEntries(entries) as Record<string, string[]>)
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong";
}

export function useForm<T extends Record<string, unknown>>(
  config: UseFormConfig<T>,
): UseFormReturn<T> {
  const { initialValues, onSubmit, validate } = config;

  const [values, setValuesState] = useState<T>({ ...initialValues });
  const [errors, setErrorsState] = useState<Partial<Record<keyof T, string[]>>>(
    {},
  );
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const initialRef = useRef(initialValues);
  const knownFields = useRef(new Set(Object.keys(initialValues)));
  const onSubmitRef = useRef(onSubmit);
  const validateRef = useRef(validate);

  useEffect(() => {
    onSubmitRef.current = onSubmit;
  }, [onSubmit]);
  useEffect(() => {
    validateRef.current = validate;
  }, [validate]);

  const dirty = Object.keys(initialRef.current).some(
    (key) => values[key as keyof T] !== initialRef.current[key as keyof T],
  );

  const setValues = useCallback((partial: Partial<T>) => {
    setValuesState((prev) => ({ ...prev, ...partial }));
  }, []);

  const setErrors = useCallback((errs: Partial<Record<keyof T, string[]>>) => {
    setErrorsState(errs);
  }, []);

  const setFieldError = useCallback((name: keyof T, fieldErrors: string[]) => {
    setErrorsState((prev) => ({ ...prev, [name]: fieldErrors }));
  }, []);

  const clearErrors = useCallback(() => {
    setErrorsState({});
    setFormErrors([]);
  }, []);

  const reset = useCallback(() => {
    setValuesState({ ...initialRef.current });
    setErrorsState({});
    setFormErrors([]);
    setTouched({});
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (busy) return;

      if (validateRef.current) {
        const validationErrors = validateRef.current(values);
        const hasErrors = Object.values(validationErrors).some(
          (errs) => errs && (errs as string[]).length > 0,
        );
        if (hasErrors) {
          setErrorsState(validationErrors);
          return;
        }
      }

      clearErrors();
      setBusy(true);

      try {
        await onSubmitRef.current(values);
      } catch (err: unknown) {
        const extractedErrors = extractErrorMap(err);

        if (extractedErrors) {
          const fieldErrs: Partial<Record<keyof T, string[]>> = {};
          const orphan: string[] = [];

          for (const [field, messages] of Object.entries(extractedErrors)) {
            if (knownFields.current.has(field)) {
              fieldErrs[field as keyof T] = messages;
            } else {
              orphan.push(...messages);
            }
          }

          setErrorsState(fieldErrs);
          setFormErrors(orphan);
        } else if (!axios.isAxiosError(err)) {
          toast.error(errorMessage(err));
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, values, clearErrors],
  );

  const field = useCallback(
    <K extends keyof T>(name: K): FieldBinding<T[K]> => ({
      name: name as string,
      value: values[name],
      onChange: (value: T[K]) => {
        setValuesState((prev) => ({ ...prev, [name]: value }));
        setErrorsState((prev) => {
          if (!prev[name]) return prev;
          const next = { ...prev };
          delete next[name];
          return next;
        });
      },
      onBlur: () => {
        setTouched((prev) => ({ ...prev, [name]: true }));
      },
      errors: errors[name] ?? [],
    }),
    [values, errors],
  );

  return {
    values,
    errors,
    touched,
    busy,
    dirty,
    formErrors,
    field,
    handleSubmit,
    reset,
    setValues,
    setErrors,
    setFieldError,
    clearErrors,
  };
}
