import type { FieldConfig, FieldBinding } from "@shared/types/form";
import { Input } from "./Input";
import { Select } from "./Select";
import { Checkbox } from "./Checkbox";
import { CheckboxGroup } from "./CheckboxGroup";
import { Radio } from "./Radio";
import { FileUpload } from "./FileUpload";
import { DatePicker } from "./DatePicker";
import { TimePicker } from "./TimePicker";
import { DateTimePicker } from "./DateTimePicker";

interface FormFieldProps {
  config: FieldConfig;
  binding: FieldBinding;
}

export function FormField({ config, binding }: FormFieldProps) {
  const { type, name, ...rest } = config;
  const commonProps = { ...rest, name, errors: binding.errors };

  switch (type) {
    case "select":
      return (
        <Select
          {...commonProps}
          value={binding.value}
          onChange={binding.onChange}
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
          onChange={binding.onChange}
        />
      );
    case "checkbox-group":
      return (
        <CheckboxGroup
          {...commonProps}
          value={binding.value ?? []}
          onChange={binding.onChange}
          options={config.options ?? []}
        />
      );
    case "radio":
      return (
        <Radio
          {...commonProps}
          value={binding.value}
          onChange={binding.onChange}
          options={config.options ?? []}
        />
      );
    case "date":
      return (
        <DatePicker
          {...commonProps}
          value={binding.value}
          onChange={binding.onChange}
          minDate={config.minDate}
          maxDate={config.maxDate}
          format={config.format}
        />
      );
    case "time":
      return (
        <TimePicker
          {...commonProps}
          value={binding.value}
          onChange={binding.onChange}
          minuteStep={config.minuteStep}
        />
      );
    case "datetime":
      return (
        <DateTimePicker
          {...commonProps}
          value={binding.value}
          onChange={binding.onChange}
          minDate={config.minDate}
          maxDate={config.maxDate}
          minuteStep={config.minuteStep}
        />
      );
    case "file":
      return (
        <FileUpload
          {...commonProps}
          value={binding.value}
          onChange={binding.onChange}
          multiple={config.multiple}
          accept={config.accept}
          maxSize={config.maxSize}
          maxFiles={config.maxFiles}
          preview={config.preview}
        />
      );
    default:
      return (
        <Input
          {...commonProps}
          type={type as any}
          value={binding.value}
          onChange={binding.onChange}
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
