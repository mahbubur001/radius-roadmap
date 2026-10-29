"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { updatePublicSiteAction } from "@/app/(dashboard)/_actions/workspaces";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { SwitchField } from "@/components/form/switch-field";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import {
  type PublicSiteInput,
  publicSiteSchema,
} from "@/lib/schemas/workspace";

/** Which modules the public site shows, and the idea form's legal links. */
export function PublicSiteForm({
  workspace,
  defaults,
  canManage,
}: {
  workspace: string;
  defaults: PublicSiteInput;
  canManage: boolean;
}) {
  const router = useRouter();
  const form = useForm<PublicSiteInput>({
    resolver: zodResolver(publicSiteSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: PublicSiteInput) {
    const result = await updatePublicSiteAction({ workspace, ...values });
    if (!result.ok) return toast.error(result.error);
    toast.success("Public site saved.");
    form.reset(values);
    router.refresh();
  }

  return (
    <SettingsSection
      title="Public site"
      description="Choose what visitors see. Each module gets a tab in the site's header."
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <fieldset disabled={!canManage}>
          <FieldGroup>
            <SwitchField
              control={form.control}
              name="showRoadmap"
              label="Roadmap"
              description="Your public roadmaps and their cards."
            />
            <SwitchField
              control={form.control}
              name="showUpdates"
              label="Updates"
              description="Your published posts (changelog), with an RSS feed and email subscriptions."
            />
            <SwitchField
              control={form.control}
              name="showIdeas"
              label="Ideas"
              description="Public feedback boards where visitors suggest and vote on ideas."
            />
            <FieldSeparator>Comments and follows</FieldSeparator>
            <SwitchField
              control={form.control}
              name="commentsEnabled"
              label="Comments"
              description="Visitors can comment on ideas and roadmap cards. Your team can always leave internal notes."
            />
            <SwitchField
              control={form.control}
              name="approveComments"
              label="Approve comments first"
              description="Visitors' comments wait under Feedback → Comments until someone approves them."
            />
            <SwitchField
              control={form.control}
              name="followsEnabled"
              label="Follows"
              description="Visitors can follow ideas. Voting on or suggesting an idea follows it. Follow emails arrive with Updates."
            />
            <FieldSeparator>Idea form</FieldSeparator>
            <TextField
              control={form.control}
              name="termsUrl"
              label="Terms of service link"
              description="When set (with or without a privacy link), people must accept them before submitting an idea."
              placeholder="https://example.com/terms"
              type="url"
            />
            <TextField
              control={form.control}
              name="privacyUrl"
              label="Privacy policy link"
              placeholder="https://example.com/privacy"
              type="url"
            />
            {canManage ? (
              <Button
                type="submit"
                className="self-start"
                disabled={
                  form.formState.isSubmitting || !form.formState.isDirty
                }
              >
                Save changes
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Only owners and admins can change these settings.
              </p>
            )}
          </FieldGroup>
        </fieldset>
      </form>
    </SettingsSection>
  );
}
