import { Map as MapIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PublicIdea } from "@/server/services/public-ideas";
import { VoteButton } from "./vote-button";

const TAB =
  "flex-none rounded-none border-0 border-b-2 border-transparent px-1 pt-2 pb-2.5 data-active:border-primary data-active:text-primary";

/**
 * One idea, shared by the Ideas drawer and the idea page. `tags` and
 * `roadmapHref` are only known on the full page.
 */
export function IdeaDetail({
  idea,
  commentsEnabled,
  tags,
  roadmapHref,
}: {
  idea: PublicIdea;
  commentsEnabled: boolean;
  tags?: string[];
  roadmapHref?: string | null;
}) {
  return (
    <article className="flex flex-col">
      <header className="flex flex-col items-start gap-4 border-b px-6 pt-6 pb-5">
        <h1 className="pr-8 text-xl font-semibold tracking-tight">
          {idea.title}
        </h1>
        <VoteButton
          cardId={idea.id}
          votes={idea.votes}
          variant="pill"
          kind="idea"
        />
      </header>
      <Tabs defaultValue="details" className="gap-0">
        <TabsList
          variant="line"
          className="h-auto w-full justify-start gap-5 rounded-none border-b px-6"
        >
          <TabsTrigger value="details" className={TAB}>
            Details
          </TabsTrigger>
          {commentsEnabled ? (
            <TabsTrigger value="comments" className={TAB}>
              Comments ({idea.comments})
            </TabsTrigger>
          ) : null}
        </TabsList>
        <TabsContent value="details" className="flex flex-col gap-5 px-6 py-5">
          <Field label="Status">
            <StatusChip status={idea.status} />
          </Field>
          {idea.objective ? (
            <Field label="Objective">
              <span className="flex w-fit items-center gap-1.5 rounded border px-2.5 py-1 text-sm">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: idea.objective.color }}
                />
                {idea.objective.name}
              </span>
            </Field>
          ) : null}
          {tags ? (
            <Field label="Tags">
              {tags.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <Badge key={t} variant="outline">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Untagged</span>
              )}
            </Field>
          ) : null}
          {roadmapHref ? (
            <a
              href={roadmapHref}
              className="flex w-fit items-center gap-2 text-sm text-primary underline"
            >
              <MapIcon className="size-4" />
              Planned on the roadmap
            </a>
          ) : null}
          {idea.html ? (
            <Field label="Details">
              <div
                className="rich-text"
                // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
                dangerouslySetInnerHTML={{ __html: idea.html }}
              />
            </Field>
          ) : null}
        </TabsContent>
        {commentsEnabled ? (
          <TabsContent value="comments" className="px-6 py-5">
            <p className="text-sm text-muted-foreground">No comments yet.</p>
          </TabsContent>
        ) : null}
      </Tabs>
    </article>
  );
}

export function StatusChip({ status }: { status: PublicIdea["status"] }) {
  return (
    <span className="flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: status.color }}
      />
      {status.name}
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm text-muted-foreground">{label}</h2>
      {children}
    </section>
  );
}
