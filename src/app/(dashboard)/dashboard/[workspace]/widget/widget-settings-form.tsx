"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ExternalLink, Eye, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  revealWidgetKeyAction,
  rotateWidgetKeyAction,
  updateWidgetSettingsAction,
} from "@/app/(dashboard)/_actions/widget";
import { CopyBlock } from "@/components/dashboard/copy-block";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { useActionError } from "@/components/dashboard/use-action-error";
import { ColorPicker } from "@/components/form/color-picker";
import { SwitchField } from "@/components/form/switch-field";
import { TextField } from "@/components/form/text-field";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import {
  type WidgetSettingsInput,
  widgetSettingsSchema,
} from "@/lib/schemas/widget";

const CHOICES = {
  layout: [
    ["sidebar", "Sidebar (slides in from the side)"],
    ["popover", "Popover (small panel above the button)"],
  ],
  position: [
    ["right", "Bottom right"],
    ["left", "Bottom left"],
  ],
  launcher: [
    ["bell", "Bell button"],
    ["none", "None: open it from your own button"],
  ],
} as const;

/** Settings → Widget: install snippet, look, modules and identity key. */
export function WidgetSettingsForm({
  workspace,
  origin,
  site,
  isDefault,
  defaults,
}: {
  workspace: string;
  origin: string;
  /** The account slug. */
  site: string;
  /** The default workspace needs no `workspace` in the snippet. */
  isDefault: boolean;
  defaults: WidgetSettingsInput;
}) {
  const actionError = useActionError();
  const form = useForm<WidgetSettingsInput>({
    resolver: zodResolver(widgetSettingsSchema),
    defaultValues: defaults,
  });
  const launcher = form.watch("launcher");

  async function onSubmit(values: WidgetSettingsInput) {
    const result = await updateWidgetSettingsAction({ workspace, ...values });
    if (!result.ok) return actionError(result);
    toast.success("Widget saved.");
    form.reset(values);
  }

  const config = [
    `site: "${site}"`,
    isDefault ? null : `workspace: "${workspace}"`,
    launcher === "none" ? `selector: "#whats-new"` : null,
  ]
    .filter(Boolean)
    .join(", ");
  const snippet = `<script>
  window.radiusRoadmapConfig = { ${config} };
</script>
<script src="${origin}/widget.js" async></script>`;
  const testUrl = `${origin}/widget-test.html?site=${encodeURIComponent(site)}${
    isDefault ? "" : `&workspace=${encodeURIComponent(workspace)}`
  }`;

  return (
    <>
      <SettingsSection
        title="Install"
        description="Paste this before </body> on every page where the widget should appear."
      >
        <CopyBlock label="Widget code" value={snippet} />
        {launcher === "none" ? (
          <p className="text-xs text-muted-foreground">
            The widget opens when someone clicks the element matching{" "}
            <code>selector</code>. You can also call{" "}
            <code>RadiusRoadmap.toggle()</code>, <code>show()</code> or{" "}
            <code>hide()</code> from your own code.
          </p>
        ) : null}
        <Button variant="outline" size="sm" className="self-start" asChild>
          <a href={testUrl} target="_blank" rel="noreferrer">
            <ExternalLink />
            Try it on a test page
          </a>
        </Button>
      </SettingsSection>

      <SettingsSection title="Look and content">
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            {(Object.keys(CHOICES) as (keyof typeof CHOICES)[]).map((name) => (
              <Controller
                key={name}
                control={form.control}
                name={name}
                render={({ field }) => (
                  <Field>
                    <FieldLabel htmlFor={`widget-${name}`}>
                      {name === "layout"
                        ? "Layout"
                        : name === "position"
                          ? "Position"
                          : "Launcher"}
                    </FieldLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id={`widget-${name}`} className="w-80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CHOICES[name].map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
              />
            ))}
            <TextField
              control={form.control}
              name="title"
              label="Title"
              placeholder="What's new"
            />
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <Field>
                  <FieldLabel>Colour</FieldLabel>
                  <div className="flex items-center gap-3">
                    <ColorPicker
                      label="Widget colour"
                      value={field.value || "#4f46e5"}
                      onChange={field.onChange}
                    />
                    {field.value ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => field.onChange("")}
                      >
                        Use the default
                      </Button>
                    ) : (
                      <span className="text-sm text-muted-foreground">
                        Default
                      </span>
                    )}
                  </div>
                </Field>
              )}
            />
            <FieldSeparator>Content</FieldSeparator>
            <SwitchField
              control={form.control}
              name="reactions"
              label="Emoji reactions"
              description="People can react to posts inside the widget."
            />
            <SwitchField
              control={form.control}
              name="feedback"
              label="Send feedback"
              description="A form that creates an idea on your first public feedback board. Ideas from people you haven't identified wait in the triage inbox."
            />
            <Button
              type="submit"
              className="self-start"
              disabled={form.formState.isSubmitting || !form.formState.isDirty}
            >
              Save widget
            </Button>
          </FieldGroup>
        </form>
      </SettingsSection>

      <IdentifyUsers workspace={workspace} site={site} />
    </>
  );
}

/** Signing key for identity tokens (doc 26 P10). */
function IdentifyUsers({
  workspace,
  site,
}: {
  workspace: string;
  site: string;
}) {
  const [key, setKey] = useState<string | null>(null);

  async function reveal() {
    const result = await revealWidgetKeyAction({ workspace });
    if (!result.ok) return toast.error(result.error);
    setKey(result.data);
  }

  async function rotate() {
    const result = await rotateWidgetKeyAction({ workspace });
    if (!result.ok) return toast.error(result.error);
    setKey(result.data);
    toast.success("New key created. Update it on your server.");
  }

  const example = `// On your server (Node, with the "jose" package):
import { SignJWT } from "jose";

const token = await new SignJWT({ email: user.email, name: user.name })
  .setProtectedHeader({ alg: "HS256" })
  .setSubject(String(user.id))
  .setIssuedAt()
  .setExpirationTime("1h")
  .sign(new TextEncoder().encode(process.env.RADIUS_WIDGET_KEY));

// On the page:
window.radiusRoadmapConfig = { site: "${site}", token };`;

  return (
    <SettingsSection
      title="Identify your users"
      description="Without this, people type their name and email to send feedback, and it waits for review. With a token signed on your server, they're recognised and their reactions follow them across devices."
    >
      <div className="flex flex-col gap-2">
        {key ? (
          <CopyBlock label="Signing key (keep it secret)" value={key} />
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={reveal}
          >
            <Eye />
            Show signing key
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start"
            >
              <RefreshCw />
              Create a new key
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Create a new signing key?</AlertDialogTitle>
              <AlertDialogDescription>
                Tokens signed with the current key stop working at once, so
                people are treated as guests until your server uses the new key.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={rotate}>
                Create new key
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
      <CopyBlock label="Example" value={example} />
    </SettingsSection>
  );
}
