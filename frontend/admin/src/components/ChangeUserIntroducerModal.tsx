import { Button, Input, Select } from "@shared/components";
import { useForm } from "@shared/hooks";
import { ModalBody, ModalFooter } from "@shared/modal";
import type {
  AdminUserIntroducerChangeResponse,
  AdminUserLookupOptionResponse,
  ChangeUserIntroducerRequest,
} from "@shared/types/generated";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { api } from "@/api";
import { userOptionLabel } from "@/userLookup";

const FORM_ID = "change-user-introducer-form";

interface ChangeUserIntroducerFormValues extends Record<string, unknown> {
  introducer_user_id: string;
}

interface ChangeUserIntroducerModalProps {
  userId: string;
  userLabel: string;
  currentIntroducerUserId: string;
  currentIntroducerLabel: string;
  onSaved?: () => void;
  onClose: () => void;
}

export function ChangeUserIntroducerModal({
  userId,
  userLabel,
  currentIntroducerUserId,
  currentIntroducerLabel,
  onSaved,
  onClose,
}: ChangeUserIntroducerModalProps) {
  const { t } = useTranslation();
  const [userOptions, setUserOptions] = useState<
    AdminUserLookupOptionResponse[]
  >([]);
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [selectedUser, setSelectedUser] =
    useState<AdminUserLookupOptionResponse | null>(null);

  const form = useForm<ChangeUserIntroducerFormValues>({
    initialValues: {
      introducer_user_id: "",
    },
    validate: (values) => {
      const errors: Partial<
        Record<keyof ChangeUserIntroducerFormValues, string[]>
      > = {};
      const nextIntroducerUserId = String(
        values.introducer_user_id ?? "",
      ).trim();

      if (
        nextIntroducerUserId !== "" &&
        nextIntroducerUserId === currentIntroducerUserId
      ) {
        errors.introducer_user_id = [
          t("admin.introducer_changes.errors.same_introducer"),
        ];
      }

      if (nextIntroducerUserId !== "" && nextIntroducerUserId === userId) {
        errors.introducer_user_id = [
          t("admin.introducer_changes.errors.self_introducer"),
        ];
      }

      return errors;
    },
    onSubmit: async (values) => {
      const payload: ChangeUserIntroducerRequest = {
        introducer_user_id: String(values.introducer_user_id ?? "").trim(),
      };

      await api.post<AdminUserIntroducerChangeResponse>(
        `/users/${userId}/introducer-changes`,
        payload,
      );

      toast.success(t("admin.introducer_changes.changed"));
      onSaved?.();
      onClose();
    },
  });

  const fetchUsers = useCallback(
    async (query = "") => {
      setOptionsLoading(true);
      try {
        const { data } = await api.get<AdminUserLookupOptionResponse[]>(
          "/users/options",
          {
            params: query.trim() === "" ? undefined : { q: query.trim() },
          },
        );
        setUserOptions(() => {
          if (!selectedUser) {
            return data;
          }

          return data.some((user) => user.id === selectedUser.id)
            ? data
            : [selectedUser, ...data];
        });
      } finally {
        setOptionsLoading(false);
      }
    },
    [selectedUser],
  );

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const introducerField = form.field("introducer_user_id");
  const userSelectOptions = useMemo(
    () =>
      userOptions.map((user) => ({
        value: user.id,
        label: userOptionLabel(user),
        disabled: user.id === userId || user.id === currentIntroducerUserId,
      })),
    [currentIntroducerUserId, userId, userOptions],
  );

  return (
    <>
      <ModalBody>
        <div className="sf-admin-form-page">
          <div>
            <h3 className="sf-page-title">
              {t("admin.introducer_changes.change_title")}
            </h3>
            <p className="sf-page-subtitle">
              {t("admin.introducer_changes.change_help")}
            </p>
          </div>

          {form.formErrors.length > 0 && (
            <div className="sf-form-error-banner">
              {form.formErrors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          )}

          <form
            id={FORM_ID}
            className="sf-admin-form"
            onSubmit={form.handleSubmit}
          >
            <div className="sf-admin-form-section">
              <div className="sf-admin-form-section__header">
                <h2>{t("admin.introducer_changes.change_title")}</h2>
                <p>{t("admin.introducer_changes.change_help")}</p>
              </div>

              <Input
                name="user_label"
                label={t("admin.introducer_changes.fields.user")}
                value={userLabel}
                readOnly
              />

              <Input
                name="current_introducer_label"
                label={t("admin.introducer_changes.fields.current_introducer")}
                value={currentIntroducerLabel}
                readOnly
              />

              <Select
                name={introducerField.name}
                label={t("admin.introducer_changes.fields.introducer")}
                value={
                  typeof introducerField.value === "string"
                    ? introducerField.value
                    : ""
                }
                options={userSelectOptions}
                searchable
                clearable
                loading={optionsLoading}
                onSearch={(query) => fetchUsers(query)}
                onChange={(value) => {
                  const nextValue = Array.isArray(value)
                    ? (value[0] ?? "")
                    : value;
                  introducerField.onChange(nextValue);
                  setSelectedUser(
                    userOptions.find((user) => user.id === nextValue) ?? null,
                  );
                }}
                errors={introducerField.errors}
                placeholder={t("admin.introducer_changes.user_placeholder")}
              />
            </div>
          </form>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button type="button" variant="secondary" onClick={onClose}>
          {t("Cancel")}
        </Button>
        <Button type="submit" form={FORM_ID} busy={form.busy}>
          {t("Save")}
        </Button>
      </ModalFooter>
    </>
  );
}
