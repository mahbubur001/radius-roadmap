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
  ALERT_OPTIONS,
  type AlertKind,
  FREQUENCY_LABELS,
  type Frequency,
  type NotificationPrefs,
  notificationPrefsSchema,
} from "@/lib/schemas/notifications";

const ROWS: { name: AlertKind; label: string; hint: string }[] = [
  {
    name: "newFeedback",
    label: "New ideas",
    hint: "When a visitor suggests an idea on your public site.",
  },
  {
    name: "reviewReminder",
    label: "Ideas waiting for review",
    hint: "Ideas still in the inbox after 24 hours, oldest first.",
  },
  {
    name: "votes",
    label: "Votes",
    hint: "Right away: when a card or idea reaches 10, 25, 50, 100… votes. Digest: new votes and the most voted items.",
  },
  {
    name: "newComment",
    label: "New comments",
    hint: "Comments from visitors and teammates on ideas and roadmap cards.",
  },
  {
    name: "replies",
    label: "Replies to you",
    hint: "Someone comments where you commented before.",
  },
  {
    name: "newSubscriber",
    label: "New subscribers",
    hint: "When someone confirms they want your updates by email.",
  },
  {
    name: "weeklySummary",
    label: "Weekly summary",
    hint: "Ideas, votes, comments and what shipped in the last 7 days, every Monday.",
  },
];

/** Labels for the summary's On / Off. */
const optionLabel = (name: AlertKind, f: Frequency) =>
  name === "weeklySummary" ? (f === "off" ? "Off" : "On") : FREQUENCY_LABELS[f];

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
      description="For this workspace only. Daily digests arrive around 08:00 UTC, weekly digests on Mondays."
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
                      {ALERT_OPTIONS[row.name].map((f) => (
                        <SelectItem key={f} value={f}>
                          {optionLabel(row.name, f)}
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
