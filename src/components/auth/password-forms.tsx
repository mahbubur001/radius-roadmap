"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import {
  type ForgotPasswordInput,
  forgotPasswordSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
} from "@/lib/schemas/auth";

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit({ email }: ForgotPasswordInput) {
    // Same response whether or not the email exists.
    await authClient.requestPasswordReset({
      email,
      redirectTo: "/reset-password",
    });
    setSent(true);
  }

  if (sent) {
    return (
      <p className="text-sm text-muted-foreground">
        If an account exists for that email, a reset link is on its way.
      </p>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <TextField
          control={form.control}
          name="email"
          label="Email"
          type="email"
        />
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full"
        >
          Send reset link
        </Button>
      </FieldGroup>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirm: "" },
  });

  if (!token) {
    return (
      <p className="text-sm text-destructive">
        This reset link is invalid or has expired.
      </p>
    );
  }

  async function onSubmit({ password }: ResetPasswordInput) {
    const { error } = await authClient.resetPassword({
      newPassword: password,
      token: token ?? "",
    });
    if (error) {
      toast.error(error.message ?? "Couldn't reset your password.");
      return;
    }
    toast.success("Password updated. Please sign in.");
    router.push("/sign-in");
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <TextField
          control={form.control}
          name="password"
          label="New password"
          type="password"
          autoComplete="new-password"
        />
        <TextField
          control={form.control}
          name="confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
        />
        <Button
          type="submit"
          disabled={form.formState.isSubmitting}
          className="w-full"
        >
          Update password
        </Button>
      </FieldGroup>
    </form>
  );
}
