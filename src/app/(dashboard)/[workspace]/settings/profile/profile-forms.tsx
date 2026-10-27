"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { SwitchField } from "@/components/form/switch-field";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import {
  type ChangeEmailInput,
  type ChangePasswordInput,
  changeEmailSchema,
  changePasswordSchema,
  type ProfileNameInput,
  profileNameSchema,
} from "@/lib/schemas/auth";

export function NameForm({ name }: { name: string }) {
  const router = useRouter();
  const form = useForm<ProfileNameInput>({
    resolver: zodResolver(profileNameSchema),
    defaultValues: { name },
  });

  async function onSubmit(values: ProfileNameInput) {
    const { error } = await authClient.updateUser({ name: values.name });
    if (error) {
      toast.error(error.message ?? "Couldn't save your name.");
      return;
    }
    toast.success("Name saved.");
    form.reset(values);
    router.refresh();
  }

  return (
    <SettingsSection title="Name">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <TextField
            control={form.control}
            name="name"
            label="Your name"
            autoComplete="name"
          />
          <div>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || !form.formState.isDirty}
            >
              Save
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
  );
}

export function EmailForm({ email }: { email: string }) {
  const { workspace } = useParams<{ workspace: string }>();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<ChangeEmailInput>({
    resolver: zodResolver(changeEmailSchema),
    defaultValues: { newEmail: "" },
  });

  async function onSubmit(values: ChangeEmailInput) {
    const { error } = await authClient.changeEmail({
      newEmail: values.newEmail,
      callbackURL: `/${workspace}/settings/profile`,
    });
    if (error) {
      toast.error(error.message ?? "Couldn't start the email change.");
      return;
    }
    setSentTo(values.newEmail);
    form.reset();
  }

  return (
    <SettingsSection
      title="Email"
      description={`You sign in with ${email}. To change it, approve the change from this address, then confirm the new one.`}
    >
      {sentTo ? (
        <p className="text-sm">
          Check <strong>{email}</strong> for a link to approve changing to{" "}
          <strong>{sentTo}</strong>. Nothing changes until both links are
          opened.
        </p>
      ) : null}
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <TextField
            control={form.control}
            name="newEmail"
            label="New email"
            type="email"
            autoComplete="email"
          />
          <div>
            <Button
              type="submit"
              variant="outline"
              disabled={form.formState.isSubmitting}
            >
              Change email
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
  );
}

export function PasswordForm() {
  const form = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirm: "",
      revokeOtherSessions: true,
    },
  });

  async function onSubmit(values: ChangePasswordInput) {
    const { error } = await authClient.changePassword({
      currentPassword: values.currentPassword,
      newPassword: values.newPassword,
      revokeOtherSessions: values.revokeOtherSessions,
    });
    if (error) {
      toast.error(error.message ?? "Couldn't change your password.");
      return;
    }
    toast.success("Password changed.");
    form.reset();
  }

  return (
    <SettingsSection title="Password">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <TextField
            control={form.control}
            name="currentPassword"
            label="Current password"
            type="password"
            autoComplete="current-password"
          />
          <TextField
            control={form.control}
            name="newPassword"
            label="New password"
            type="password"
            autoComplete="new-password"
            description="At least 10 characters."
          />
          <TextField
            control={form.control}
            name="confirm"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
          />
          <SwitchField
            control={form.control}
            name="revokeOtherSessions"
            label="Sign out of other devices"
          />
          <div>
            <Button
              type="submit"
              variant="outline"
              disabled={form.formState.isSubmitting}
            >
              Change password
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
  );
}

export function SessionsSection() {
  const [busy, setBusy] = useState(false);
  return (
    <SettingsSection
      title="Sessions"
      description="Signed in somewhere you don't recognise? Sign out everywhere except here."
    >
      <div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const { error } = await authClient.revokeOtherSessions();
            setBusy(false);
            if (error)
              toast.error(error.message ?? "Couldn't sign out other devices.");
            else toast.success("Signed out of all other devices.");
          }}
        >
          Sign out other devices
        </Button>
      </div>
    </SettingsSection>
  );
}
