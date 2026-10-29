"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { setNotificationPrefsAction } from "@/app/(dashboard)/_actions/notifications";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FREQUENCIES,
  FREQUENCY_LABELS,
  type NotificationPrefs,
  notificationPrefsSchema,
} from "@/lib/schemas/notifications";

const ROWS: { name: keyof NotificationPrefs; label: string; hint: string }[] = [
  {
    name: "newFeedback",
    label: "New ideas",
    hint: "When a visitor suggests an idea on your public site.",
  },
  {
    name: "newComment",
    label: "New comments",
    hint: "Comments from visitors and teammates on ideas and roadmap cards.",
  },
];

/** The member's own email alerts for this workspace. */
export function NotificationsForm({
  workspace,
  defaults,
}: {
  workspace: string;
  defaults: NotificationPrefs;
}) {
  const form = useForm<NotificationPrefs>({
    resolver: zodResolver(notificationPrefsSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: NotificationPrefs) {
    const result = await setNotificationPrefsAction({ workspace, ...values });
    if (!result.ok) return toast.error(result.error);
    toast.success("Notifications saved.");
    form.reset(values);
  }

  return (
    <SettingsSection
      title="Email notifications"
      description="For this workspace only. Daily digests arrive around 08:00 UTC."
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          {ROWS.map((row) => (
            <Controller
              key={row.name}
              control={form.control}
              name={row.name}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor={row.name}>{row.label}</FieldLabel>
                    <FieldDescription>{row.hint}</FieldDescription>
                  </FieldContent>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id={row.name} className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {FREQUENCY_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            />
          ))}
          <Button
            type="submit"
            className="self-start"
            disabled={form.formState.isSubmitting || !form.formState.isDirty}
          >
            Save changes
          </Button>
        </FieldGroup>
      </form>
    </SettingsSection>
  );
}
