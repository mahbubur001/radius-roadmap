"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import { type SignUpInput, signUpSchema } from "@/lib/schemas/auth";

export function SignUpForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: "", email: "", password: "" },
  });

  async function onSubmit(values: SignUpInput) {
    setPending(true);
    const { error } = await authClient.signUp.email({
      ...values,
      callbackURL: "/onboarding",
    });
    setPending(false);
    if (error) {
      toast.error(error.message ?? "Couldn't create your account.");
      return;
    }
    router.push(`/check-email?email=${encodeURIComponent(values.email)}`);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <TextField
          control={form.control}
          name="name"
          label="Your name"
          autoComplete="name"
        />
        <TextField
          control={form.control}
          name="email"
          label="Work email"
          type="email"
          autoComplete="email"
        />
        <TextField
          control={form.control}
          name="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          description="At least 10 characters."
        />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Creating account…" : "Create account"}
        </Button>
      </FieldGroup>
    </form>
  );
}
