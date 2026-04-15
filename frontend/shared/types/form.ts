import type { ReactNode, RefObject } from "react";

// ── Select ──────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

// ── Field Props (shared base) ───────────────────────────

export interface FieldBase {
  name: string;
  label?: string;
  errors?: string[];
  hints?: (string | ReactNode)[];
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

// ── Input ───────────────────────────────────────────────

export type InputType =
  | "text" | "email" | "password" | "number"
  | "tel" | "url" | "search" | "textarea"
  | "money" | "atm";

export interface InputProps extends FieldBase {
  type?: InputType;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  onPrefocus?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  maxLength?: number;
  rows?: number;
  inputRef?: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}

// ── Select ──────────────────────────────────────────────

export interface SelectProps extends FieldBase {
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  options?: SelectOption[];
  placeholder?: string;
  multiple?: boolean;
  searchable?: boolean;
  clearable?: boolean;
  onSearch?: (query: string) => void | Promise<void>;
  loading?: boolean;
}

// ── Checkbox ────────────────────────────────────────────

export interface CheckboxProps extends FieldBase {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  children?: ReactNode;
}

export interface CheckboxGroupProps extends FieldBase {
  value?: string[];
  onChange?: (value: string[]) => void;
  options: SelectOption[];
}

// ── Radio ───────────────────────────────────────────────

export interface RadioProps extends FieldBase {
  value?: string;
  onChange?: (value: string) => void;
  options: SelectOption[];
}

// ── File Upload ─────────────────────────────────────────

export interface FileUploadProps extends FieldBase {
  value?: File | File[] | null;
  onChange?: (files: File | File[] | null) => void;
  multiple?: boolean;
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  preview?: boolean;
}

// ── Button ──────────────────────────────────────────────

export type ButtonVariant = "primary" | "secondary" | "danger" | "warning" | "ghost" | "plain" | "link";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps {
  children?: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  type?: "button" | "submit" | "reset";
  busy?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  iconOnly?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  href?: string;
  target?: string;
  rel?: string;
  className?: string;
  form?: string;
  tabIndex?: number;
}

// ── Date/Time Picker ────────────────────────────────────

export interface DatePickerProps extends FieldBase {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  format?: string;
}

export interface TimePickerProps extends FieldBase {
  value?: string;          // "HH:mm" format
  onChange?: (time: string) => void;
  placeholder?: string;
  minuteStep?: number;     // 1, 5, 10, 15, 30
}

export interface DateTimePickerProps extends FieldBase {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  placeholder?: string;
  minDate?: Date;
  maxDate?: Date;
  minuteStep?: number;
}

// ── Form Builder / Field Config ─────────────────────────

export type FieldType =
  | "text" | "email" | "password" | "number"
  | "tel" | "url" | "search" | "textarea"
  | "money" | "atm"
  | "select" | "checkbox" | "checkbox-group"
  | "radio" | "file"
  | "date" | "time" | "datetime";

export interface FieldConfig {
  name: string;
  type: FieldType;
  label?: string;
  placeholder?: string;
  hints?: (string | ReactNode)[];
  required?: boolean;
  disabled?: boolean;
  className?: string;
  // Input-specific
  prefix?: ReactNode;
  suffix?: ReactNode;
  maxLength?: number;
  rows?: number;
  // Select-specific
  options?: SelectOption[];
  multiple?: boolean;
  searchable?: boolean;
  onSearch?: (query: string) => void | Promise<void>;
  loading?: boolean;
  // Checkbox-specific
  children?: ReactNode;
  // Date-specific
  minDate?: Date;
  maxDate?: Date;
  minuteStep?: number;
  format?: string;
  // File-specific
  accept?: string;
  maxSize?: number;
  maxFiles?: number;
  preview?: boolean;
}

// ── DataTable ───────────────────────────────────────────

export interface LightboxImage {
  src: string;
  title?: string;
  subtitle?: string;
}

export interface DataTableColumn<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  cellClassName?: string;
  headerClassName?: string;
  render?: (row: T) => ReactNode;
  footer?: (rows: T[]) => ReactNode;
}

export interface DataTableProps<T> {
  url: string;
  title?: string;
  subtitle?: string;
  columns: DataTableColumn<T>[];
  downloadUrl?: string;
  refreshInterval?: number;
  defaultPerPage?: number;
  footerSums?: string[];
  className?: string;
  showIndex?: boolean;
  refreshRef?: React.MutableRefObject<(() => void) | null>;
}

export interface DataTableSort {
  field: string;
  direction: "asc" | "desc";
}

export interface DataTableFilter {
  field: string;
  op: string;
  value: any;
}

export interface DataTableMeta {
  columns: Array<{ name: string; label: string; sortable: boolean; filterable: boolean }>;
  pagination: { page: number; per_page: number; total: number; total_pages: number };
  filters: any[];
  applied_filters: any[];
  sorts: Array<{ field: string; direction: string }>;
}

// ── useForm ─────────────────────────────────────────────

export interface UseFormConfig<T extends Record<string, any>> {
  initialValues: T;
  onSubmit: (values: T) => void | Promise<void>;
  validate?: (values: T) => Partial<Record<keyof T, string[]>>;
}

export interface FieldBinding {
  name: string;
  value: any;
  onChange: (value: any) => void;
  onBlur: () => void;
  errors: string[];
}

export interface UseFormReturn<T extends Record<string, any>> {
  values: T;
  errors: Partial<Record<keyof T, string[]>>;
  touched: Partial<Record<keyof T, boolean>>;
  busy: boolean;
  dirty: boolean;
  /** Errors for fields not present in this form (orphan server errors). Show at top of form. */
  formErrors: string[];
  field: (name: keyof T) => FieldBinding;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  reset: () => void;
  setValues: (values: Partial<T>) => void;
  setErrors: (errors: Partial<Record<keyof T, string[]>>) => void;
  setFieldError: (name: keyof T, errors: string[]) => void;
  clearErrors: () => void;
}

// ── FormBuilder ─────────────────────────────────────────

export interface FormBuilderProps<T extends Record<string, any>> {
  form: UseFormReturn<T>;
  fields: FieldConfig[];
  submitLabel?: string;
  className?: string;
}

