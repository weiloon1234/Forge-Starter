import type {
  AdminUserResponse,
  CreateUserRequest,
  UpdateUserRequest,
} from "@shared/types/generated";

export interface UserFormValues extends Record<string, unknown> {
  introducer_user_id: string;
  username: string;
  name: string;
  email: string;
  password: string;
  country_iso2: string;
  contact_country_iso2: string;
  contact_number: string;
}

export function emptyUserFormValues(): UserFormValues {
  return {
    introducer_user_id: "",
    username: "",
    name: "",
    email: "",
    password: "",
    country_iso2: "",
    contact_country_iso2: "",
    contact_number: "",
  };
}

export function userFormValuesFromResponse(
  user: AdminUserResponse,
): UserFormValues {
  return {
    introducer_user_id: user.introducer_user_id ?? "",
    username: user.username ?? "",
    name: user.name ?? "",
    email: user.email ?? "",
    password: "",
    country_iso2: user.country_iso2 ?? "",
    contact_country_iso2: user.contact_country_iso2 ?? "",
    contact_number: user.contact_number ?? "",
  };
}

export function buildCreateUserPayload(
  values: UserFormValues,
): CreateUserRequest {
  return {
    introducer_user_id: String(values.introducer_user_id ?? "").trim(),
    username: optionalTrimmed(values.username) ?? null,
    email: optionalTrimmed(values.email) ?? null,
    name: optionalTrimmed(values.name) ?? null,
    password: values.password,
    country_iso2: optionalTrimmed(values.country_iso2) ?? null,
    contact_country_iso2: optionalTrimmed(values.contact_country_iso2) ?? null,
    contact_number: optionalTrimmed(values.contact_number) ?? null,
  };
}

export function buildUpdateUserPayload(
  values: UserFormValues,
): UpdateUserRequest {
  return {
    username: optionalTrimmed(values.username) ?? null,
    email: optionalTrimmed(values.email) ?? null,
    name: optionalTrimmed(values.name) ?? null,
    password: values.password ? values.password : null,
    country_iso2: optionalTrimmed(values.country_iso2) ?? null,
    contact_country_iso2: optionalTrimmed(values.contact_country_iso2) ?? null,
    contact_number: optionalTrimmed(values.contact_number) ?? null,
  };
}

function optionalTrimmed(value: unknown): string | undefined {
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? undefined : trimmed;
}
