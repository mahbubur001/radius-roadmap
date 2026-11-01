"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  deleteWorkspaceAction,
  updateWorkspaceAction,
} from "@/app/(dashboard)/_actions/workspaces";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { ConfirmDelete } from "@/components/form/confirm-delete";
import { SwitchField } from "@/components/form/switch-field";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SITE_THEMES,
  type SiteTheme,
  type UpdateWorkspaceInput,
  updateWorkspaceSchema,
} from "@/lib/schemas/workspace";

const THEME_LABELS: Record<SiteTheme, string> = {
  system: "Visitor's system",
  light: "Light",
  dark: "Dark",
};

export function WorkspaceSettingsForm({
  workspace,
}: {
  workspace: UpdateWorkspaceInput & { id: string };
}) {
  const router = useRouter();
  const { id, ...defaults } = workspace;
  const form = useForm<UpdateWorkspaceInput>({
    resolver: zodResolver(updateWorkspaceSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: UpdateWorkspaceInput) {
    const result = await updateWorkspaceAction({ id, ...values });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Workspace saved.");
    form.reset(values);
    if (result.data.slug !== workspace.slug) {
      router.replace(`/dashboard/${result.data.slug}/settings/workspace`);
    }
    router.refresh();
  }

  return (
    <SettingsSection title="General">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <TextField
            control={form.control}
            name="name"
            label="Workspace name"
          />
          <TextField
            control={form.control}
            name="slug"
            label="Workspace URL"
            description="Changing it breaks existing dashboard links to this workspace."
          />
          <FieldSeparator>Public pages</FieldSeparator>
          <SwitchField
            control={form.control}
            name="settings.requireVoterLogin"
            label="Require sign-in to vote, comment or submit"
            description="Off: anyone can vote anonymously."
          />
          <Controller
            control={form.control}
            name="settings.theme"
            render={({ field }) => (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel htmlFor="settings.theme">Theme</FieldLabel>
                </FieldContent>
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger id="settings.theme" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SITE_THEMES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {THEME_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <SwitchField
            control={form.control}
            name="settings.indexPublicPages"
            label="Let search engines index public pages"
          />
          <div>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || !form.formState.isDirty}
            >
              {form.formState.isSubmitting ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </SettingsSection>
  );
}

export function DeleteWorkspace({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmDelete
      trigger="Delete workspace"
      title={`Delete ${name}?`}
      description="Its feedback, roadmap, updates and articles are deleted for good."
      confirmText={name}
      actionLabel="Delete workspace"
      onConfirm={async () => {
        const result = await deleteWorkspaceAction({ id });
        if (!result.ok) {
          toast.error(result.error);
          return false;
        }
        toast.success("Workspace deleted.");
        router.push("/");
        router.refresh();
        return true;
      }}
    />
  );
}
