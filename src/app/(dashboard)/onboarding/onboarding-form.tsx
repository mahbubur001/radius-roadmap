"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import {
  type OnboardingInput,
  onboardingSchema,
  slugify,
} from "@/lib/schemas/workspace";
import { completeOnboarding } from "./actions";

export function OnboardingForm() {
  const router = useRouter();
  const form = useForm<OnboardingInput>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      accountName: "",
      accountSlug: "",
      workspaceName: "",
      workspaceSlug: "",
    },
  });

  // Fill the slug from the name until the user edits the slug themselves.
  function syncSlug(
    nameField: "accountName" | "workspaceName",
    slugField: "accountSlug" | "workspaceSlug",
  ) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const prev = slugify(form.getValues(nameField));
      if (!form.getValues(slugField) || form.getValues(slugField) === prev) {
        form.setValue(slugField, slugify(e.target.value));
      }
    };
  }

  async function onSubmit(values: OnboardingInput) {
    const result = await completeOnboarding(values);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push(`/dashboard/${result.workspaceSlug}`);
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <TextField
          control={form.control}
          name="accountName"
          label="Company or team name"
          placeholder="Radius Theme"
          onChangeCapture={syncSlug("accountName", "accountSlug")}
        />
        <TextField
          control={form.control}
          name="accountSlug"
          label="Account URL"
          description="Lowercase letters, numbers and dashes."
        />
        <FieldSeparator>First workspace</FieldSeparator>
        <TextField
          control={form.control}
          name="workspaceName"
          label="Product or project name"
          placeholder="Classified Listing"
          onChangeCapture={syncSlug("workspaceName", "workspaceSlug")}
        />
        <TextField
          control={form.control}
          name="workspaceSlug"
          label="Workspace URL"
        />
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full"
        >
          {form.formState.isSubmitting ? "Setting up…" : "Continue"}
        </Button>
      </FieldGroup>
    </form>
  );
}
