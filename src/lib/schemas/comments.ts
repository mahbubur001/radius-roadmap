import { z } from "zod";

// Comments on ideas and roadmap cards (doc 20 D3, step 7) and idea follows.

const body = z
  .string()
  .trim()
  .min(1, "Write a comment")
  .max(5000, "Keep it under 5000 characters");

/** Exactly one of feedbackId / cardId. */
const target = {
  feedbackId: z.uuid().optional(),
  cardId: z.uuid().optional(),
};
const oneTarget = (v: { feedbackId?: string; cardId?: string }) =>
  !!v.feedbackId !== !!v.cardId;

export const commentTargetSchema = z
  .object(target)
  .refine(oneTarget, "Pick an idea or a card.");

/** Dashboard: a team reply, or an internal note when `internal`. */
export const teamCommentSchema = z
  .object({ ...target, body, internal: z.boolean() })
  .refine(oneTarget, "Pick an idea or a card.");

export const updateCommentSchema = z.object({ id: z.uuid(), body });
export const commentIdSchema = z.object({ id: z.uuid() });

/** Public site: a visitor's comment. */
export const publicCommentSchema = z
  .object({
    ...target,
    body,
    turnstileToken: z.string().max(4096).optional(),
  })
  .refine(oneTarget, "Pick an idea or a card.");

export const followSchema = z.object({
  feedbackId: z.uuid(),
  follow: z.boolean(),
});

export type CommentTargetInput = z.infer<typeof commentTargetSchema>;
