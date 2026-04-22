import { Button, Input, Select } from "@shared/components";
import { useForm } from "@shared/hooks";
import { ModalBody, ModalFooter, modal } from "@shared/modal";
import type {
  AdminUserLookupOptionResponse,
  AdminUserResponse,
  CreateUserRequest,
  Permission,
  UpdateUserRequest,
} from "@shared/types/generated";
import { Pencil } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/api";
import { auth } from "@/auth";
import { ChangeUserIntroducerModal } from "@/components/ChangeUserIntroducerModal";
import { hasPermission } from "@/hooks/usePermission";
import { mergeUserOptions, userOptionLabel } from "@/userLookup";

const USERS_MANAGE: Permission = "users.manage";
const INTRODUCER_CHANGES_MANAGE: Permission = "introducer_changes.manage";
const FORM_ID = "user-form-modal";

interface UserFormValues extends Record<string, unknown> {
  introducer_user_id: string;
  username: string;
  name: string;
  email: string;
  password: string;
  country_iso2: string;
  contact_country_iso2: string;
  contact_number: string;
}

interface UserFormModalProps {
  userId?: string;
  initialIntroducerLabel?: string | null;
  onSaved?: () => void;
  onClose: () => void;
}

function emptyUserFormValues(): UserFormValues {
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

function userDisplayLabel(user: AdminUserResponse): string {
  return user.name ?? user.username ?? user.email ?? user.id;
}

export function UserFormModal({
  userId,
  initialIntroducerLabel,
  onSaved,
  onClose,
}: UserFormModalProps) {
  const { t } = useTranslation();
  const { user: actor } = auth.useAuth();
  const isCreate = !userId;
  const canManageUsers = hasPermission(
    actor?.abilities,
    USERS_MANAGE,
    actor?.admin_type,
  );
  const canManageIntroducerChanges = hasPermission(
    actor?.abilities,
    INTRODUCER_CHANGES_MANAGE,
    actor?.admin_type,
  );

  const [loading, setLoading] = useState(!isCreate);
  const [loadedUser, setLoadedUser] = useState<AdminUserResponse | null>(null);
  const introducerLabel = initialIntroducerLabel ?? null;

  const [userOptions, setUserOptions] = useState<
    AdminUserLookupOptionResponse[]
  >([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedIntroducer, setSelectedIntroducer] =
    useState<AdminUserLookupOptionResponse | null>(null);
  const userSearchRequestRef = useRef(0);

  const form = useForm<UserFormValues>({
    initialValues: emptyUserFormValues(),
    onSubmit: async (values) => {
      if (isCreate) {
        const payload: CreateUserRequest = {
          introducer_user_id: values.introducer_user_id.trim(),
          username: values.username.trim() || null,
          email: values.email.trim() || null,
          name: values.name.trim() || null,
          password: values.password,
          country_iso2: values.country_iso2.trim() || null,
          contact_country_iso2: values.contact_country_iso2.trim() || null,
          contact_number: values.contact_number.trim() || null,
        };
        await api.post<AdminUserResponse>("/users", payload);
        toast.success(t("User created"));
      } else if (userId) {
        const payload: UpdateUserRequest = {
          username: values.username.trim() || null,
          email: values.email.trim() || null,
          name: values.name.trim() || null,
          password: values.password ? values.password : null,
          country_iso2: values.country_iso2.trim() || null,
          contact_country_iso2: values.contact_country_iso2.trim() || null,
          contact_number: values.contact_number.trim() || null,
        };
        await api.put<AdminUserResponse>(`/users/${userId}`, payload);
        toast.success(t("User updated"));
      }
      onSaved?.();
      onClose();
    },
  });
  const { setValues } = form;

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (isCreate) {
        setValues(emptyUserFormValues());
        setLoading(false);
        return;
      }

      if (!canManageUsers) {
        onClose();
        return;
      }

      try {
        const { data } = await api.get<AdminUserResponse>(`/users/${userId}`);
        if (!active) {
          return;
        }
        setLoadedUser(data);
        setValues({
          introducer_user_id: data.introducer_user_id ?? "",
          username: data.username ?? "",
          name: data.name ?? "",
          email: data.email ?? "",
          password: "",
          country_iso2: data.country_iso2 ?? "",
          contact_country_iso2: data.contact_country_iso2 ?? "",
          contact_number: data.contact_number ?? "",
        });
        setLoading(false);
      } catch {
        if (active) {
          onClose();
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [canManageUsers, isCreate, onClose, setValues, userId]);

  const fetchIntroducerOptions = useCallback(
    async (query = "") => {
      const requestId = ++userSearchRequestRef.current;
      const trimmedQuery = query.trim();
      if (trimmedQuery === "") {
        setUserOptions(() => mergeUserOptions([], selectedIntroducer));
        setOptionsLoading(false);
        return;
      }

      setOptionsLoading(true);
      try {
        const { data } = await api.get<AdminUserLookupOptionResponse[]>(
          "/users/options",
          { params: { q: trimmedQuery } },
        );
        if (requestId !== userSearchRequestRef.current) {
          return;
        }
        setUserOptions(() => mergeUserOptions(data, selectedIntroducer));
      } finally {
        if (requestId === userSearchRequestRef.current) {
          setOptionsLoading(false);
        }
      }
    },
    [selectedIntroducer],
  );

  const introducerField = form.field("introducer_user_id");
  const usernameField = form.field("username");
  const nameField = form.field("name");
  const emailField = form.field("email");
  const passwordField = form.field("password");
  const countryField = form.field("country_iso2");
  const contactCountryField = form.field("contact_country_iso2");
  const contactNumberField = form.field("contact_number");

  const introducerSelectOptions = useMemo(
    () =>
      userOptions.map((u) => ({
        value: u.id,
        label: userOptionLabel(u),
      })),
    [userOptions],
  );

  const openChangeIntroducer = () => {
    if (!loadedUser?.introducer_user_id) {
      return;
    }
    modal.open(
      ChangeUserIntroducerModal,
      {
        userId: loadedUser.id,
        userLabel: userDisplayLabel(loadedUser),
        currentIntroducerUserId: loadedUser.introducer_user_id,
        currentIntroducerLabel:
          introducerLabel ?? loadedUser.introducer_user_id,
        onSaved: () => {
          onSaved?.();
          onClose();
        },
      },
      { title: t("admin.introducer_changes.change_title") },
    );
  };

  if (loading) {
    return (
      <ModalBody>
        <div className="sf-page-subtitle">{t("Loading")}</div>
      </ModalBody>
    );
  }

  const showIntroducerChangeButton =
    !isCreate && canManageIntroducerChanges && !!loadedUser?.introducer_user_id;

  return (
    <>
      <ModalBody>
        <div className="sf-admin-form-page">
          <div>
            <h3 className="sf-page-title">
              {t(isCreate ? "Create User" : "Edit User")}
            </h3>
          </div>

          {form.formErrors.length > 0 && (
            <div className="sf-form-error-banner">
              {form.formErrors.map((err) => (
                <div key={err}>{err}</div>
              ))}
            </div>
          )}

          <form
            id={FORM_ID}
            className="sf-admin-form"
            onSubmit={form.handleSubmit}
          >
            <div className="sf-admin-form-grid">
              {isCreate ? (
                <Select
                  name={introducerField.name}
                  label={t("Introducer")}
                  value={
                    typeof introducerField.value === "string"
                      ? introducerField.value
                      : ""
                  }
                  options={introducerSelectOptions}
                  searchable
                  clearable
                  loading={optionsLoading}
                  onSearch={(q) => fetchIntroducerOptions(q)}
                  onChange={(value) => {
                    const next = Array.isArray(value)
                      ? (value[0] ?? "")
                      : value;
                    introducerField.onChange(next);
                    const nextUser =
                      userOptions.find((u) => u.id === next) ?? null;
                    setSelectedIntroducer(nextUser);
                    setUserOptions(() => mergeUserOptions([], nextUser));
                  }}
                  errors={introducerField.errors}
                  placeholder={t("admin.credits.user_placeholder")}
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <Input
                    name="introducer_label"
                    label={t("Introducer")}
                    value={introducerLabel ?? ""}
                    readOnly
                    disabled
                  />
                  {showIntroducerChangeButton && (
                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        prefix={<Pencil size={14} />}
                        onClick={openChangeIntroducer}
                      >
                        {t("admin.introducer_changes.change_action")}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              <Input
                name={usernameField.name}
                label={t("Username")}
                value={usernameField.value}
                onChange={usernameField.onChange}
                onBlur={usernameField.onBlur}
                errors={usernameField.errors}
              />

              <Input
                name={nameField.name}
                label={t("Name")}
                value={nameField.value}
                onChange={nameField.onChange}
                onBlur={nameField.onBlur}
                errors={nameField.errors}
              />

              <Input
                name={emailField.name}
                type="email"
                label={t("Email")}
                value={emailField.value}
                onChange={emailField.onChange}
                onBlur={emailField.onBlur}
                errors={emailField.errors}
              />

              <Input
                name={passwordField.name}
                type="password"
                label={isCreate ? t("Password") : t("New password")}
                placeholder={
                  isCreate
                    ? undefined
                    : t("Leave blank to keep the current password")
                }
                value={passwordField.value}
                onChange={passwordField.onChange}
                onBlur={passwordField.onBlur}
                errors={passwordField.errors}
              />

              <Input
                name={countryField.name}
                label={t("Country")}
                value={countryField.value}
                onChange={countryField.onChange}
                onBlur={countryField.onBlur}
                errors={countryField.errors}
              />

              <Input
                name={contactCountryField.name}
                label={t("Contact country")}
                value={contactCountryField.value}
                onChange={contactCountryField.onChange}
                onBlur={contactCountryField.onBlur}
                errors={contactCountryField.errors}
              />

              <Input
                name={contactNumberField.name}
                label={t("Contact number")}
                value={contactNumberField.value}
                onChange={contactNumberField.onChange}
                onBlur={contactNumberField.onBlur}
                errors={contactNumberField.errors}
              />
            </div>
          </form>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button type="button" variant="secondary" size="sm" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button type="submit" size="sm" busy={form.busy} form={FORM_ID}>
          {t("Save")}
        </Button>
      </ModalFooter>
    </>
  );
}
