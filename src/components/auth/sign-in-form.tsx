"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { TextField } from "@/components/form/text-field";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { authClient } from "@/lib/auth-client";
import { type SignInInput, signInSchema } from "@/lib/schemas/auth";

export function SignInForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInInput) {
    setPending(true);
    const { error } = await authClient.signIn.email(values);
    setPending(false);
    if (error) {
      if (error.status === 403) {
        toast.error("Please verify your email first. We sent you a new link.");
        return;
      }
      toast.error(error.message ?? "Couldn't sign in.");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <TextField
          control={form.control}
          name="email"
          label="Email"
          type="email"
          autoComplete="email"
        />
        <TextField
          control={form.control}
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
        />
        <div className="flex justify-end text-sm">
          <Link
            href="/forgot-password"
            className="text-muted-foreground hover:underline"
          >
            Forgot password?
          </Link>
        </div>
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </FieldGroup>
    </form>
  );
}
