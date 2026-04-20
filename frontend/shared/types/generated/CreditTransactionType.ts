// Auto-generated from AppEnum. Do not edit.

export type CreditTransactionType = "admin_add" | "admin_deduct" | "transfer_received" | "transfer_sent";

export const CreditTransactionTypeValues = [
  "admin_add",
  "admin_deduct",
  "transfer_received",
  "transfer_sent",
] as const;

export const CreditTransactionTypeOptions = [
  { value: "admin_add", labelKey: "enum.credit_transaction_type.admin_add" },
  { value: "admin_deduct", labelKey: "enum.credit_transaction_type.admin_deduct" },
  { value: "transfer_received", labelKey: "enum.credit_transaction_type.transfer_received" },
  { value: "transfer_sent", labelKey: "enum.credit_transaction_type.transfer_sent" },
] as const;

export const CreditTransactionTypeMeta = {
id: "credit_transaction_type",
keyKind: "string",
options: CreditTransactionTypeOptions,
} as const;
