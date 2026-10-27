"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { updateAccountAction } from "@/app/(dashboard)/_actions/workspaces";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import {
  type UpdateAccountInput,
  updateAccountSchema,
} from "@/lib/schemas/account";

export function AccountForm({ defaults }: { defaults: UpdateAccountInput }) {
  const router = useRouter();
  const form = useForm<UpdateAccountInput>({
    resolver: zodResolver(updateAccountSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: UpdateAccountInput) {
    const result = await updateAccountAction(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Account saved.");
    form.reset(values);
    router.refresh();
  }

  return (
    <SettingsSection title="Account details">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <TextField
            control={form.control}
            name="name"
            label="Company or team name"
          />
          <TextField
            control={form.control}
            name="slug"
            label="Account URL"
            description="Used in your public site address. Changing it later breaks old links."
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
