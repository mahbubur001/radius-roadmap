import { z } from "zod";

const email = z.email("Enter a valid email").trim().toLowerCase();
const password = z.string().min(10, "At least 10 characters").max(128);

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(80),
  email,
  password,
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });

// Profile (sent through Better Auth, which re-checks them server-side).
export const profileNameSchema = z.object({
  name: z.string().trim().min(2, "At least 2 characters").max(80),
});

export const changeEmailSchema = z.object({ newEmail: email });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword: password,
    confirm: z.string(),
    revokeOtherSessions: z.boolean(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ["confirm"],
    message: "Passwords don't match",
  });

export type SignInInput = z.infer<typeof signInSchema>;
export type SignUpInput = z.infer<typeof signUpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ProfileNameInput = z.infer<typeof profileNameSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
