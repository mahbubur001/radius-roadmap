import { z } from "zod";

// The JavaScript widget's settings (doc 26 6B), kept in the workspace's
// `settings.widget`. Shared by the settings form, the server and the widget API.

export const widgetSettingsSchema = z.object({
  layout: z.enum(["sidebar", "popover"]),
  position: z.enum(["right", "left"]),
  launcher: z.enum(["bell", "none"]),
  /** "" = the site's accent colour. */
  color: z.union([
    z.literal(""),
    z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour"),
  ]),
  title: z.string().trim().max(40, "At most 40 characters"),
  reactions: z.boolean(),
  feedback: z.boolean(),
});

export type WidgetSettingsInput = z.input<typeof widgetSettingsSchema>;

export const WIDGET_DEFAULTS = {
  layout: "sidebar",
  position: "right",
  launcher: "bell",
  color: null,
  title: "What's new",
  reactions: true,
  feedback: true,
} as const;

/** Stored settings with defaults filled in. */
export function widgetSettings(
  stored: Partial<{
    layout: "sidebar" | "popover";
    position: "right" | "left";
    launcher: "bell" | "none";
    color: string | null;
    title: string | null;
    reactions: boolean;
    feedback: boolean;
  }> = {},
) {
  return {
    ...WIDGET_DEFAULTS,
    ...stored,
    title: stored.title || WIDGET_DEFAULTS.title,
  };
}

/** Body of the widget's "Send feedback" form. */
export const widgetFeedbackSchema = z.object({
  workspace: z.string().trim().min(1).max(64),
  title: z
    .string()
    .trim()
    .min(3, "At least 3 characters")
    .max(200, "Keep the title under 200 characters"),
  details: z.string().trim().max(5000, "Keep it under 5000 characters"),
  name: z.string().trim().max(80).optional(),
  email: z.email("Enter a valid email").optional(),
});

export const widgetReactionSchema = z.object({
  workspace: z.string().trim().min(1).max(64),
  updateId: z.uuid(),
  emoji: z.string().min(1).max(20),
});
