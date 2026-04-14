import { useState, useCallback, useRef, useMemo } from "react";
import type { UseFormConfig, UseFormReturn, FieldBinding } from "../types/form";

export function useForm<T extends Record<string, any>>(
  config: UseFormConfig<T>
): UseFormReturn<T> {
  const { initialValues, onSubmit, validate } = config;

  const [values, setValuesState] = useState<T>({ ...initialValues });
  const [errors, setErrorsState] = useState<Partial<Record<keyof T, string[]>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [busy, setBusy] = useState(false);

  const initialRef = useRef(initialValues);

  const dirty = useMemo(() => {
    return Object.keys(initialRef.current).some(
      (key) => values[key as keyof T] !== initialRef.current[key as keyof T]
    );
  }, [values]);

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
  }, []);

  const reset = useCallback(() => {
    setValuesState({ ...initialRef.current });
    setErrorsState({});
    setTouched({});
  }, []);

  const handleSubmit = useCallback(
    async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      if (busy) return;

      // Run client-side validation if provided
      if (validate) {
        const validationErrors = validate(values);
        const hasErrors = Object.values(validationErrors).some(
          (errs) => errs && (errs as string[]).length > 0
        );
        if (hasErrors) {
          setErrorsState(validationErrors);
          return;
        }
      }

      clearErrors();
      setBusy(true);

      try {
        await onSubmit(values);
      } catch (err: any) {
        // ApiFormError (422) has .errors as Record<string, string[]>
        // Auto-wires to <Input errors={...} /> display
        if (err?.errors && typeof err.errors === "object") {
          setErrorsState(err.errors);
        } else {
          throw err;
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, values, validate, onSubmit, clearErrors]
  );

  const field = useCallback(
    (name: keyof T): FieldBinding => ({
      name: name as string,
      value: values[name] ?? "",
      onChange: (value: any) => {
        setValuesState((prev) => ({ ...prev, [name]: value }));
        // Clear field error on change
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
      errors: (errors[name] as string[]) ?? [],
    }),
    [values, errors]
  );

  return {
    values,
    errors,
    touched,
    busy,
    dirty,
    field,
    handleSubmit,
    reset,
    setValues,
    setErrors,
    setFieldError,
    clearErrors,
  };
}
