"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronUp, Lightbulb } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
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

type SimilarIdea = { id: string; slug: string; title: string; votes: number };

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
  ideaHref,
}: {
  board: { id: string; slug: string };
  /** Link to an idea page, for the look-alike suggestions. */
  ideaHref?: (slug: string) => string;
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
  const title = form.watch("title");
  // The form renders twice on the Ideas page (side panel + phone sheet), so
  // ids must be unique for labels to point at the right input.
  const uid = useId();
  const [similar, setSimilar] = useState<SimilarIdea[]>([]);
  const canLink = !!ideaHref;

  // Look-alike ideas after a short pause in typing (doc 31 M5): people vote
  // instead of posting a duplicate.
  useEffect(() => {
    const q = title.trim();
    if (q.length < 4 || !canLink) {
      setSimilar([]);
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ workspaceId, q });
      const res = await publicApi<{ items: SimilarIdea[] }>(
        `/api/public/feedback/similar?${params}`,
        { site, embed },
      );
      if (!stale && res.ok) setSimilar(res.data.items ?? []);
    }, 350);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [title, workspaceId, site, embed, canLink]);
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
      <Field id={`${uid}-title`} label="Title" error={errors.title?.message}>
        <Input
          id={`${uid}-title`}
          placeholder="Required"
          maxLength={200}
          aria-invalid={!!errors.title}
          {...form.register("title")}
        />
      </Field>
      {similar.length && ideaHref ? (
        <section
          aria-label="Similar ideas"
          className="-mt-1 rounded-lg bg-primary/5 p-3 ring-1 ring-primary/15"
        >
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
            Similar ideas, vote instead?
          </p>
          <ul className="flex flex-col">
            {similar.map((i) => (
              <li key={i.id}>
                <a
                  href={ideaHref(i.slug)}
                  className="flex items-center gap-2 py-1.5 text-sm hover:underline"
                >
                  <Lightbulb className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{i.title}</span>
                  <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary">
                    <ChevronUp className="size-3.5" />
                    {i.votes}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <Field
        id={`${uid}-details`}
        label="More details"
        error={errors.details?.message}
      >
        <Textarea
          id={`${uid}-details`}
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
          <Field id={`${uid}-name`} label="Name" error={errors.name?.message}>
            <Input
              id={`${uid}-name`}
              placeholder="Required"
              autoComplete="name"
              aria-invalid={!!errors.name}
              {...form.register("name")}
            />
          </Field>
          <Field
            id={`${uid}-email`}
            label="Email address"
            error={errors.email?.message}
          >
            <Input
              id={`${uid}-email`}
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
              id={`${uid}-terms`}
              className="mt-0.5"
              checked={!!form.watch("acceptTerms")}
              onCheckedChange={(on) =>
                form.setValue("acceptTerms", on === true, {
                  shouldValidate: true,
                })
              }
            />
            <Label
              htmlFor={`${uid}-terms`}
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
