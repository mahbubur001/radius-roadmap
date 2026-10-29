import { z } from "zod";

// Updates / changelog (doc 23).

const id = z.uuid();

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(40),
  color: z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a colour"),
});
export const editUpdateCategorySchema = updateCategorySchema.extend({ id });
