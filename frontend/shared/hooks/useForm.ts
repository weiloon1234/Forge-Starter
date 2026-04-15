import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import type { UseFormConfig, UseFormReturn, FieldBinding } from "../types/form";

export function useForm<T extends Record<string, any>>(
  config: UseFormConfig<T>
): UseFormReturn<T> {
  const { initialValues, onSubmit, validate } = config;

  const [values, setValuesState] = useState<T>({ ...initialValues });
  const [errors, setErrorsState] = useState<Partial<Record<keyof T, string[]>>>({});
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
  const [busy, setBusy] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);

  const initialRef = useRef(initialValues);
  const knownFields = useRef(new Set(Object.keys(initialValues)));
  const valuesRef = useRef(values);
  const onSubmitRef = useRef(onSubmit);
  const validateRef = useRef(validate);

  useEffect(() => { valuesRef.current = values; }, [values]);
  useEffect(() => { onSubmitRef.current = onSubmit; }, [onSubmit]);
  useEffect(() => { validateRef.current = validate; }, [validate]);

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

      const currentValues = valuesRef.current;

      if (validateRef.current) {
        const validationErrors = validateRef.current(currentValues);
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
        await onSubmitRef.current(currentValues);
      } catch (err: any) {
        if (err?.errors && typeof err.errors === "object") {
          const fieldErrs: Partial<Record<keyof T, string[]>> = {};
          const orphan: string[] = [];

          for (const [field, messages] of Object.entries(err.errors)) {
            if (knownFields.current.has(field)) {
              fieldErrs[field as keyof T] = messages as string[];
            } else {
              orphan.push(...(messages as string[]));
            }
          }

          setErrorsState(fieldErrs);
          setFormErrors(orphan);
        } else if (!axios.isAxiosError(err)) {
          toast.error(err?.message || "Something went wrong");
        }
      } finally {
        setBusy(false);
      }
    },
    [busy, clearErrors]
  );

  const field = useCallback(
    (name: keyof T): FieldBinding => ({
      name: name as string,
      value: values[name] ?? "",
      onChange: (value: any) => {
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
