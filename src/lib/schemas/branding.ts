import { z } from "zod";
import { HEX_COLOR } from "@/lib/color";
import { FONT_IDS } from "@/lib/fonts";

// Account branding (doc 26 6C). Logo and favicon are uploads, saved through
// the uploads action; this form holds the rest. "" and null both mean "the
// default" (the service stores null).

export const brandingSchema = z.object({
  /** "" = the default accent. */
  color: z
    .union([z.literal(""), z.string().regex(HEX_COLOR, "Pick a colour")])
    .nullable(),
  /** "" = the app's font. */
  font: z.union([z.literal(""), z.enum(FONT_IDS)]).nullable(),
  hidePoweredBy: z.boolean(),
});

export type BrandingInput = z.infer<typeof brandingSchema>;
