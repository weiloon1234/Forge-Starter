import type { SelectOption } from "@shared/types/form";
import type {
  AdminUserLookupOptionResponse,
  CreateAdminCreditAdjustmentRequest,
  CreditAdjustmentOperation,
  CreditTransactionType,
  CreditType,
} from "@shared/types/generated";
import {
  CreditAdjustmentOperationOptions,
  CreditAdjustmentOperationValues,
  CreditTypeOptions,
  CreditTypeValues,
} from "@shared/types/generated";
import { enumOptions } from "@shared/utils";
import type { TFunction } from "i18next";

const SCALE = 100_000_000n;

export interface CreditBalanceFields {
  credit_1: string;
  credit_2: string;
  credit_3: string;
  credit_4: string;
  credit_5: string;
  credit_6: string;
}

export interface CreditAdjustmentFormValues extends Record<string, unknown> {
  user_id: string;
  credit_type: CreditType;
  operation: CreditAdjustmentOperation;
  amount: string;
  remark: string;
  related_key: string;
  related_type: string;
  context_json: string;
}

export function explanationOverrideFieldKey(locale: string): string {
  return `explanation_overrides.${locale}`;
}

export function emptyCreditAdjustmentFormValues(
  locales: string[],
): CreditAdjustmentFormValues {
  const values: CreditAdjustmentFormValues = {
    user_id: "",
    credit_type: "credit_1",
    operation: "add",
    amount: "",
    remark: "",
    related_key: "",
    related_type: "",
    context_json: "{}",
  };

  for (const locale of locales) {
    values[explanationOverrideFieldKey(locale)] = "";
  }

  return values;
}

export function creditTypeOptions(t: TFunction): SelectOption[] {
  return enumOptions(CreditTypeOptions, t);
}

export function creditOperationOptions(t: TFunction): SelectOption[] {
  return enumOptions(CreditAdjustmentOperationOptions, t);
}

export function explanationKeyForOperation(
  operation: CreditAdjustmentOperation,
): string {
  return operation === "add"
    ? "credits.transactions.admin_add"
    : "credits.transactions.admin_deduct";
}

export function explanationKeyForTransactionType(
  transactionType: CreditTransactionType,
): string {
  switch (transactionType) {
    case "admin_add":
      return "credits.transactions.admin_add";
    case "admin_deduct":
      return "credits.transactions.admin_deduct";
    case "transfer_received":
      return "credits.transactions.transfer_received";
    case "transfer_sent":
      return "credits.transactions.transfer_sent";
  }
}

export function resolveExplanationPreview(
  values: CreditAdjustmentFormValues,
  locale: string,
  t: TFunction,
): string {
  const override = String(
    values[explanationOverrideFieldKey(locale)] ?? "",
  ).trim();
  if (override) {
    return override;
  }

  return t(explanationKeyForOperation(operationValue(values)));
}

export function balanceForCreditType(
  user: CreditBalanceFields | AdminUserLookupOptionResponse | null,
  creditType: CreditType,
): string {
  if (!user) {
    return "0";
  }

  switch (creditType) {
    case "credit_1":
      return user.credit_1;
    case "credit_2":
      return user.credit_2;
    case "credit_3":
      return user.credit_3;
    case "credit_4":
      return user.credit_4;
    case "credit_5":
      return user.credit_5;
    case "credit_6":
      return user.credit_6;
  }
}

export function projectedBalance(
  currentBalance: string,
  amount: string,
  operation: CreditAdjustmentOperation,
): string | null {
  const current = parseFixedDecimal(currentBalance);
  const delta = parseFixedDecimal(amount);

  if (current === null || delta === null || delta <= 0n) {
    return null;
  }

  const signedDelta = operation === "add" ? delta : -delta;
  return formatFixedDecimal(current + signedDelta);
}

export function buildCreateCreditAdjustmentPayload(
  values: CreditAdjustmentFormValues,
  locales: string[],
): CreateAdminCreditAdjustmentRequest {
  const contextJson = String(values.context_json ?? "").trim();
  const context = contextJson === "" ? {} : parseJsonObject(contextJson);
  const explanationOverrides = Object.fromEntries(
    locales
      .map((locale) => [
        locale,
        String(values[explanationOverrideFieldKey(locale)] ?? "").trim(),
      ])
      .filter(([, value]) => value !== ""),
  );

  return {
    user_id: String(values.user_id ?? ""),
    credit_type: creditTypeValue(values),
    operation: operationValue(values),
    amount: String(values.amount ?? "").trim(),
    explanation_overrides: explanationOverrides,
    remark: optionalTrimmed(values.remark) ?? null,
    related_key: optionalTrimmed(values.related_key) ?? null,
    related_type: optionalTrimmed(values.related_type) ?? null,
    context,
  };
}

export function creditTypeValue(
  values: CreditAdjustmentFormValues,
): CreditType {
  const value = values.credit_type;
  return CreditTypeValues.includes(value as CreditType)
    ? (value as CreditType)
    : "credit_1";
}

export function operationValue(
  values: CreditAdjustmentFormValues,
): CreditAdjustmentOperation {
  const value = values.operation;
  return CreditAdjustmentOperationValues.includes(
    value as CreditAdjustmentOperation,
  )
    ? (value as CreditAdjustmentOperation)
    : "add";
}

function optionalTrimmed(value: unknown): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}

function parseJsonObject(input: string): Record<string, unknown> {
  const parsed = JSON.parse(input) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("invalid_context");
  }
  return parsed as Record<string, unknown>;
}

function parseFixedDecimal(value: string): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }

  const sign = trimmed.startsWith("-") ? -1n : 1n;
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [integerPartRaw = "", fractionPartRaw = ""] = unsigned.split(".");

  if (unsigned.split(".").length > 2) {
    return null;
  }

  if (
    (integerPartRaw !== "" && !/^\d+$/.test(integerPartRaw)) ||
    (fractionPartRaw !== "" && !/^\d+$/.test(fractionPartRaw)) ||
    fractionPartRaw.length > 8
  ) {
    return null;
  }

  const integerPart = integerPartRaw === "" ? "0" : integerPartRaw;
  const fractionPart = `${fractionPartRaw}00000000`.slice(0, 8);

  return (
    sign *
    (BigInt(integerPart) * SCALE +
      BigInt(fractionPart === "" ? "0" : fractionPart))
  );
}

function formatFixedDecimal(value: bigint): string {
  if (value === 0n) {
    return "0";
  }

  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const integerPart = abs / SCALE;
  const fractionPart = abs % SCALE;

  if (fractionPart === 0n) {
    return `${sign}${integerPart.toString()}`;
  }

  const fractionText = fractionPart
    .toString()
    .padStart(8, "0")
    .replace(/0+$/, "");

  return `${sign}${integerPart.toString()}.${fractionText}`;
}
