import { z } from "zod";

const email = z.email("Enter a valid email").trim().toLowerCase();

/** A vote on a roadmap card or a public idea: exactly one of the two. */
export const voteSchema = z
  .object({
    cardId: z.uuid().optional(),
    feedbackId: z.uuid().optional(),
    turnstileToken: z.string().max(4096).optional(),
  })
  .refine((v) => !!v.cardId !== !!v.feedbackId, "Vote for one thing.");

export const guestSignInSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(80),
  email,
  turnstileToken: z.string().max(4096).optional(),
});

export const startCodeSchema = z.object({ email });

export const verifyCodeSchema = z.object({
  email,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

export type GuestSignInInput = z.infer<typeof guestSignInSchema>;
