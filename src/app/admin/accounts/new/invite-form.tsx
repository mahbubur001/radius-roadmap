"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { inviteCustomerAction } from "@/app/admin/_actions";
import { DatePicker } from "@/components/form/date-picker";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import {
  Field,
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
import { PLAN_IDS, PLANS } from "@/lib/plans";
import {
  type InviteCustomerInput,
  inviteCustomerSchema,
} from "@/lib/schemas/platform";
import { slugify } from "@/lib/schemas/workspace";

const NO_PLAN = "none";

/** Set up an account for a customer and invite its owner (doc 28 C3). */
export function InviteCustomerForm() {
  const router = useRouter();
  const form = useForm<InviteCustomerInput>({
    resolver: zodResolver(inviteCustomerSchema),
    defaultValues: {
      accountName: "",
      accountSlug: "",
      workspaceName: "",
      workspaceSlug: "",
      ownerEmail: "",
      plan: "",
      endsOn: "",
      note: "",
    },
  });
  const plan = form.watch("plan");

  async function onSubmit(values: InviteCustomerInput) {
    const result = await inviteCustomerAction(values);
    if (!result.ok) return void toast.error(result.error);
    toast.success(`Invitation sent to ${values.ownerEmail}.`);
    router.push(`/admin/accounts/${result.data.accountId}`);
  }

  // Fill the URLs from the names until they're edited by hand.
  const [accountName, workspaceName] = form.watch([
    "accountName",
    "workspaceName",
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the name changes
  useEffect(() => {
    if (!form.getFieldState("accountSlug").isDirty) {
      form.setValue("accountSlug", slugify(accountName));
    }
  }, [accountName]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the name changes
  useEffect(() => {
    if (!form.getFieldState("workspaceSlug").isDirty) {
      form.setValue("workspaceSlug", slugify(workspaceName));
    }
  }, [workspaceName]);

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="max-w-xl"
    >
      <FieldGroup>
        <TextField
          control={form.control}
          name="accountName"
          label="Company name"
          placeholder="Acme Inc"
        />
        <TextField
          control={form.control}
          name="accountSlug"
          label="Account URL"
          description="Their public site lives at /<this>."
        />
        <TextField
          control={form.control}
          name="workspaceName"
          label="First product or project"
          placeholder="Acme App"
        />
        <TextField
          control={form.control}
          name="workspaceSlug"
          label="Workspace URL"
        />
        <TextField
          control={form.control}
          name="ownerEmail"
          label="Owner's email"
          type="email"
          placeholder="founder@acme.com"
        />
        <FieldSeparator>Plan (optional)</FieldSeparator>
        <div className="flex flex-wrap gap-4">
          <Controller
            control={form.control}
            name="plan"
            render={({ field }) => (
              <Field className="w-44">
                <FieldLabel htmlFor="invite-plan">Plan</FieldLabel>
                <Select
                  value={field.value || NO_PLAN}
                  onValueChange={(v) => field.onChange(v === NO_PLAN ? "" : v)}
                >
                  <SelectTrigger id="invite-plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PLAN}>None (Free)</SelectItem>
                    {PLAN_IDS.filter((p) => p !== "free").map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLANS[p].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          {plan ? (
            <Controller
              control={form.control}
              name="endsOn"
              render={({ field }) => (
                <Field className="w-56">
                  <FieldLabel htmlFor="invite-ends">
                    Until (included)
                  </FieldLabel>
                  <DatePicker
                    id="invite-ends"
                    value={field.value || null}
                    onChange={(v) => field.onChange(v ?? "")}
                    placeholder="No end date"
                  />
                </Field>
              )}
            />
          ) : null}
        </div>
        {plan ? (
          <TextField
            control={form.control}
            name="note"
            label="Note (only admins see it)"
            placeholder="Partner deal, 30-day trial…"
          />
        ) : null}
        <Button
          type="submit"
          className="self-start"
          disabled={form.formState.isSubmitting}
        >
          {form.formState.isSubmitting
            ? "Setting up…"
            : "Create account and invite"}
        </Button>
      </FieldGroup>
    </form>
  );
}
