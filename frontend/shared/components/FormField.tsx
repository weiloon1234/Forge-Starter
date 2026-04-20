import type { FieldBinding, FieldConfig, InputType } from "@shared/types/form";
import { Checkbox } from "./Checkbox";
import { CheckboxGroup } from "./CheckboxGroup";
import { DatePicker } from "./DatePicker";
import { DateTimePicker } from "./DateTimePicker";
import { FileUpload } from "./FileUpload";
import { Input } from "./Input";
import { Radio } from "./Radio";
import { RichTextEditor } from "./RichTextEditor";
import { Select } from "./Select";
import { TimePicker } from "./TimePicker";

interface FormFieldProps<TValue> {
  config: FieldConfig;
  binding: FieldBinding<TValue>;
}

export function FormField<TValue>({ config, binding }: FormFieldProps<TValue>) {
  const { type, name, ...rest } = config;
  const commonProps = { ...rest, name, errors: binding.errors };

  switch (type) {
    case "select":
      return (
        <Select
          {...commonProps}
          value={binding.value as string | string[] | undefined}
          onChange={binding.onChange as (value: string | string[]) => void}
          options={config.options}
          multiple={config.multiple}
          searchable={config.searchable}
          onSearch={config.onSearch}
          loading={config.loading}
        />
      );
    case "checkbox":
      return (
        <Checkbox
          {...commonProps}
          checked={!!binding.value}
          onChange={binding.onChange as (checked: boolean) => void}
        />
      );
    case "checkbox-group":
      return (
        <CheckboxGroup
          {...commonProps}
          value={
            Array.isArray(binding.value) ? (binding.value as string[]) : []
          }
          onChange={binding.onChange as (value: string[]) => void}
          options={config.options ?? []}
        />
      );
    case "radio":
      return (
        <Radio
          {...commonProps}
          value={binding.value as string | undefined}
          onChange={binding.onChange as (value: string) => void}
          options={config.options ?? []}
        />
      );
    case "date":
      return (
        <DatePicker
          {...commonProps}
          value={binding.value as Date | null | undefined}
          onChange={binding.onChange as (date: Date | null) => void}
          minDate={config.minDate}
          maxDate={config.maxDate}
          format={config.format}
        />
      );
    case "time":
      return (
        <TimePicker
          {...commonProps}
          value={binding.value as string | undefined}
          onChange={binding.onChange as (value: string) => void}
          minuteStep={config.minuteStep}
        />
      );
    case "datetime":
      return (
        <DateTimePicker
          {...commonProps}
          value={binding.value as Date | null | undefined}
          onChange={binding.onChange as (date: Date | null) => void}
          minDate={config.minDate}
          maxDate={config.maxDate}
          minuteStep={config.minuteStep}
        />
      );
    case "file":
      return (
        <FileUpload
          {...commonProps}
          value={binding.value as File | File[] | null | undefined}
          onChange={binding.onChange as (files: File | File[] | null) => void}
          multiple={config.multiple}
          accept={config.accept}
          maxSize={config.maxSize}
          maxFiles={config.maxFiles}
          preview={config.preview}
        />
      );
    case "richtext":
      if (!config.uploadEndpoint || !config.uploadFolder) {
        return (
          <Input
            {...commonProps}
            type="textarea"
            value={binding.value as string | undefined}
            onChange={binding.onChange as (value: string) => void}
            onBlur={binding.onBlur}
            placeholder={config.placeholder}
            rows={config.rows}
          />
        );
      }

      return (
        <RichTextEditor
          {...commonProps}
          value={binding.value as string | undefined}
          onChange={binding.onChange as (value: string) => void}
          onBlur={binding.onBlur}
          placeholder={config.placeholder}
          uploadEndpoint={config.uploadEndpoint}
          uploadFolder={config.uploadFolder}
        />
      );
    default:
      return (
        <Input
          {...commonProps}
          type={type as InputType}
          value={binding.value as string | undefined}
          onChange={binding.onChange as (value: string) => void}
          onBlur={binding.onBlur}
          placeholder={config.placeholder}
          prefix={config.prefix}
          suffix={config.suffix}
          maxLength={config.maxLength}
          rows={config.rows}
        />
      );
  }
}
