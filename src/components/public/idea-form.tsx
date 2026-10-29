"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type IdeaFormInput, ideaFormSchema } from "@/lib/schemas/feedback";
import { guestSignInSchema } from "@/lib/schemas/voting";
import { turnstileToken } from "./turnstile";
import { publicApi, useVoter, type Voter } from "./voter-provider";

/**
 * "Add new" idea form (doc 22 step 4, LoopedIn layout). Logged-out visitors
 * give a name and email and continue as a guest (doc 20 D6); ideas go to the
 * team's review unless the board auto-publishes.
 */
export function IdeaForm({
  board,
  termsUrl,
  privacyUrl,
  onDone,
}: {
  board: { id: string; slug: string };
  termsUrl: string | null;
  privacyUrl: string | null;
  onDone?: () => void;
}) {
  const router = useRouter();
  const {
    site,
    embed,
    workspaceId,
    voter,
    setVoter,
    openSignIn,
    addPendingIdea,
  } = useVoter();
  const form = useForm<IdeaFormInput>({
    resolver: zodResolver(ideaFormSchema),
    defaultValues: { title: "", details: "", name: "", email: "" },
  });
  const { errors, isSubmitting } = form.formState;
  const needsTerms = !!(termsUrl || privacyUrl);

  async function onSubmit(values: IdeaFormInput) {
    if (needsTerms && !values.acceptTerms) {
      form.setError("acceptTerms", { message: "Please accept to continue." });
      return;
    }
    let signedIn: Voter | null = voter;
    if (!signedIn) {
      const guest = guestSignInSchema.safeParse({
        name: values.name,
        email: values.email,
      });
      if (!guest.success) {
        for (const issue of guest.error.issues) {
          const field = issue.path[0];
          if (field === "name" || field === "email") {
            form.setError(field, { message: issue.message });
          }
        }
        return;
      }
      const res = await publicApi<{ voter: Voter }>(
        "/api/public/auth/guest",
        { site, embed },
        {
          method: "POST",
          body: { ...guest.data, turnstileToken: await turnstileToken() },
        },
      );
      if (!res.ok) {
        toast.error(res.data.error ?? "Couldn't continue as a guest.");
        if (res.status === 409) openSignIn();
        return;
      }
      signedIn = res.data.voter;
      setVoter(signedIn);
    }

    const res = await publicApi<{
      id: string;
      title: string;
      boardId: string;
      pending: boolean;
    }>(
      "/api/public/feedback",
      { site, embed },
      {
        method: "POST",
        body: {
          workspaceId,
          board: board.slug,
          title: values.title,
          details: values.details,
          acceptTerms: values.acceptTerms,
          turnstileToken: signedIn.verified
            ? undefined
            : await turnstileToken(),
        },
      },
    );
    if (res.status === 401) {
      openSignIn();
      return;
    }
    if (!res.ok) {
      toast.error(res.data.error ?? "Couldn't send your idea.");
      return;
    }
    form.reset({ title: "", details: "", name: "", email: "" });
    if (res.data.pending) {
      addPendingIdea({
        id: res.data.id,
        boardId: res.data.boardId,
        title: res.data.title,
      });
      toast.success("Thanks! The team will review your idea.");
    } else {
      toast.success("Your idea is posted.");
      router.refresh();
    }
    onDone?.();
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      aria-label="Add new idea"
      className="flex flex-col gap-4"
    >
      <Field id="idea-title" label="Title" error={errors.title?.message}>
        <Input
          id="idea-title"
          placeholder="Required"
          maxLength={200}
          aria-invalid={!!errors.title}
          {...form.register("title")}
        />
      </Field>
      <Field
        id="idea-details"
        label="More details"
        error={errors.details?.message}
      >
        <Textarea
          id="idea-details"
          placeholder="Optional"
          rows={4}
          maxLength={5000}
          {...form.register("details")}
        />
      </Field>
      {voter ? (
        <p className="text-sm text-muted-foreground">
          Posting as <strong>{voter.name || voter.email}</strong>.
        </p>
      ) : (
        <>
          <Field id="idea-name" label="Name" error={errors.name?.message}>
            <Input
              id="idea-name"
              placeholder="Required"
              autoComplete="name"
              aria-invalid={!!errors.name}
              {...form.register("name")}
            />
          </Field>
          <Field
            id="idea-email"
            label="Email address"
            error={errors.email?.message}
          >
            <Input
              id="idea-email"
              type="email"
              placeholder="Required"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...form.register("email")}
            />
          </Field>
        </>
      )}
      {needsTerms ? (
        <div className="flex flex-col gap-1">
          <div className="flex items-start gap-2 text-sm">
            <Checkbox
              id="idea-terms"
              className="mt-0.5"
              checked={!!form.watch("acceptTerms")}
              onCheckedChange={(on) =>
                form.setValue("acceptTerms", on === true, {
                  shouldValidate: true,
                })
              }
            />
            <Label
              htmlFor="idea-terms"
              className="block font-normal leading-snug"
            >
              I agree to the{" "}
              {termsUrl ? (
                <a
                  href={termsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  Terms of Service
                </a>
              ) : null}
              {termsUrl && privacyUrl ? " and have read the " : null}
              {privacyUrl ? (
                <a
                  href={privacyUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline"
                >
                  Privacy Policy
                </a>
              ) : null}
            </Label>
          </div>
          {errors.acceptTerms?.message ? (
            <p className="text-sm text-destructive">
              {errors.acceptTerms.message}
            </p>
          ) : null}
        </div>
      ) : null}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Submit idea"}
      </Button>
    </form>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
