// Auto-generated from AppEnum. Do not edit.

export type CreditAdjustmentOperation = "add" | "deduct";

export const CreditAdjustmentOperationValues = [
  "add",
  "deduct",
] as const;

export const CreditAdjustmentOperationOptions = [
  { value: "add", labelKey: "enum.credit_adjustment_operation.add" },
  { value: "deduct", labelKey: "enum.credit_adjustment_operation.deduct" },
] as const;

export const CreditAdjustmentOperationMeta = {
id: "credit_adjustment_operation",
keyKind: "string",
options: CreditAdjustmentOperationOptions,
} as const;
