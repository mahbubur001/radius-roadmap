"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { updateBrandingAction } from "@/app/(dashboard)/_actions/branding";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { useActionError } from "@/components/dashboard/use-action-error";
import { ColorPicker } from "@/components/form/color-picker";
import { SwitchField } from "@/components/form/switch-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
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
import { contrastRatio, foregroundFor } from "@/lib/color";
import { FONTS, findFont, fontPreviewHref, fontStack } from "@/lib/fonts";
import { initials } from "@/lib/initials";
import { type BrandingInput, brandingSchema } from "@/lib/schemas/branding";

/** The public sites' default accent (globals.css, light set). */
const DEFAULT_COLOR = "#4f46e5";
const DEFAULT_FONT = "default";

/** "Pro plan" badge next to a gated setting, linking to Billing. */
export function PlanBadge({
  plan,
  href,
}: {
  plan: string | null;
  href: string | null;
}) {
  if (!plan) return null;
  const badge = (
    <Badge variant="secondary" className={href ? "cursor-pointer" : undefined}>
      {plan} plan
    </Badge>
  );
  return href ? <Link href={href}>{badge}</Link> : badge;
}

/** Settings → Branding: colour, font and "Powered by" (doc 26 6C). */
export function BrandingForm({
  workspace,
  account,
  billingHref,
  locked,
  defaults,
}: {
  workspace: string;
  account: { name: string; logoUrl: string | null };
  billingHref: string | null;
  /** Plan name each setting needs, or null when the plan has it. */
  locked: {
    color: string | null;
    font: string | null;
    hidePoweredBy: string | null;
  };
  defaults: BrandingInput;
}) {
  const actionError = useActionError();
  const form = useForm<BrandingInput>({
    resolver: zodResolver(brandingSchema),
    defaultValues: defaults,
  });
  const color = form.watch("color") || "";
  const font = findFont(form.watch("font"));
  const hidePoweredBy = form.watch("hidePoweredBy");

  async function onSubmit(values: BrandingInput) {
    const result = await updateBrandingAction({ workspace, ...values });
    if (!result.ok) return actionError(result);
    toast.success("Branding saved.");
    form.reset(values);
  }

  // Only the letters of each font name, for the picker.
  useStylesheet(fontPreviewHref());
  const accent = color || DEFAULT_COLOR;
  const lowContrast = color ? contrastRatio(color, "#ffffff") < 3 : false;

  return (
    <SettingsSection
      title="Colour, font and footer"
      description="Applied to every workspace's public site, embeds and widget."
    >
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Controller
            control={form.control}
            name="color"
            render={({ field }) => (
              <Field>
                <FieldLabel>
                  Brand colour
                  <PlanBadge plan={locked.color} href={billingHref} />
                </FieldLabel>
                <div className="flex items-center gap-3">
                  {locked.color && !field.value ? (
                    <span className="text-sm text-muted-foreground">
                      Default
                    </span>
                  ) : (
                    <>
                      <ColorPicker
                        label="Brand colour"
                        value={field.value || DEFAULT_COLOR}
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
                    </>
                  )}
                </div>
                {lowContrast ? (
                  <FieldDescription className="text-amber-600 dark:text-amber-500">
                    This colour is hard to see on white. Links and tabs may be
                    hard to read; pick a darker shade.
                  </FieldDescription>
                ) : null}
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="font"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="branding-font">
                  Font
                  <PlanBadge plan={locked.font} href={billingHref} />
                </FieldLabel>
                <Select
                  value={field.value || DEFAULT_FONT}
                  onValueChange={(v) =>
                    field.onChange(v === DEFAULT_FONT ? "" : v)
                  }
                  disabled={!!locked.font && !field.value}
                >
                  <SelectTrigger id="branding-font" className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_FONT}>Default</SelectItem>
                    {FONTS.map((f) => (
                      <SelectItem
                        key={f.id}
                        value={f.id}
                        style={{ fontFamily: fontStack(f) }}
                      >
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <SwitchField
            control={form.control}
            name="hidePoweredBy"
            label="Hide “Powered by Radius Roadmap”"
            description="On public sites, embeds, the widget and emails to your users."
            locked={
              locked.hidePoweredBy && billingHref
                ? { plan: locked.hidePoweredBy, href: billingHref }
                : null
            }
          />
          <Preview
            name={account.name}
            logoUrl={account.logoUrl}
            accent={accent}
            fontFamily={font ? fontStack(font) : undefined}
            fontHref={font ? previewHref(font.name) : null}
            poweredBy={!hidePoweredBy}
          />
          <Button
            type="submit"
            className="self-start"
            disabled={form.formState.isSubmitting || !form.formState.isDirty}
          >
            {form.formState.isSubmitting ? "Saving…" : "Save changes"}
          </Button>
        </FieldGroup>
      </form>
    </SettingsSection>
  );
}

/**
 * Adds a stylesheet to <head> once. Not a `<link precedence>`: React would
 * suspend the form while each newly picked font loads.
 */
function useStylesheet(href: string | null) {
  useEffect(() => {
    if (!href || document.querySelector(`link[href="${href}"]`)) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
  }, [href]);
}

function previewHref(name: string) {
  return `https://fonts.googleapis.com/css2?family=${name.replace(/ /g, "+")}:wght@400;600&display=swap`;
}

/** A small public-site header, tab and button in the chosen brand. */
function Preview({
  name,
  logoUrl,
  accent,
  fontFamily,
  fontHref,
  poweredBy,
}: {
  name: string;
  logoUrl: string | null;
  accent: string;
  fontFamily?: string;
  fontHref: string | null;
  poweredBy: boolean;
}) {
  useStylesheet(fontHref);
  return (
    <div
      aria-label="Preview"
      role="img"
      className="overflow-hidden rounded-lg border bg-white text-slate-900"
      style={{ fontFamily }}
    >
      <div className="flex items-center gap-4 border-b border-slate-200 px-4 py-3">
        <span className="flex items-center gap-2 font-semibold">
          {logoUrl ? (
            // biome-ignore lint/performance/noImgElement: tiny preview of an uploaded logo
            <img src={logoUrl} alt="" className="size-6 rounded object-cover" />
          ) : (
            <span className="grid size-6 place-items-center rounded bg-slate-100 text-[10px]">
              {initials(name)}
            </span>
          )}
          {name}
        </span>
        <span className="text-sm">
          <span
            className="border-b-2 pb-3 font-medium"
            style={{ borderColor: accent, color: accent }}
          >
            Roadmap
          </span>
          <span className="ml-4 text-slate-500">Updates</span>
        </span>
      </div>
      <div className="flex items-center justify-between gap-4 px-4 py-4">
        <span className="text-sm">Dark mode for the dashboard</span>
        <span
          className="rounded-md px-3 py-1.5 text-sm font-medium"
          style={{ backgroundColor: accent, color: foregroundFor(accent) }}
        >
          Vote
        </span>
      </div>
      {poweredBy ? (
        <p className="pb-3 text-center text-xs text-slate-500">
          Powered by Radius Roadmap
        </p>
      ) : null}
    </div>
  );
}
