import { Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PublicCard } from "@/server/services/public-site";
import { PublicComments } from "./public-comments";
import { VoteButton } from "./vote-button";

const TAB =
  "-mb-px flex-none rounded-none border-0 border-b-2 border-transparent px-1 pt-2 pb-2.5 after:hidden data-active:border-primary data-active:text-primary";

/**
 * Full card view, shared by the card page and the board's drawer (doc 22
 * step 3): title and vote on top, then Details / Comments tabs.
 */
export function CardDetail({
  card,
  columnName,
  commentsEnabled,
}: {
  card: PublicCard;
  columnName: string;
  commentsEnabled: boolean;
}) {
  const features = card.features ?? [];
  const progress = card.progress;
  return (
    <article className="flex flex-col">
      {card.image ? (
        // biome-ignore lint/performance/noImgElement: tenant uploads on any host
        <img
          src={card.image}
          alt=""
          className="aspect-[3/1] w-full object-cover"
        />
      ) : null}
      <header className="flex flex-col items-start gap-4 border-b px-6 pt-6 pb-5">
        <h1 className="pr-8 text-xl font-semibold tracking-tight">
          {card.title}
        </h1>
        <VoteButton cardId={card.id} votes={card.votes} variant="pill" />
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
              Comments ({card.comments})
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="details" className="flex flex-col gap-5 px-6 py-5">
          <Field label="Status">
            <Badge variant="secondary">
              {card.completed ? "Done" : columnName}
            </Badge>
          </Field>

          {card.objective ? (
            <Field label="Objective">
              <span className="flex w-fit items-center gap-1.5 rounded border px-2.5 py-1 text-sm">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: card.objective.color }}
                />
                {card.objective.name}
              </span>
            </Field>
          ) : null}

          <Field label="Tags">
            {card.tags.length ? (
              <div className="flex flex-wrap gap-1.5">
                {card.tags.map((t) => (
                  <Badge key={t} variant="outline">
                    {t}
                  </Badge>
                ))}
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">Untagged</span>
            )}
          </Field>

          {card.plannedFor ? (
            <Field label="Planned for">
              <span className="text-sm">
                {new Date(`${card.plannedFor}T00:00:00`).toLocaleDateString(
                  "en",
                  { month: "long", year: "numeric" },
                )}
              </span>
            </Field>
          ) : null}

          {card.html ? (
            <Field label="Summary">
              <div
                className="rich-text"
                // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
                // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
                dangerouslySetInnerHTML={{ __html: card.html }}
              />
            </Field>
          ) : null}

          {progress || features.length ? (
            <Field
              label={
                progress
                  ? `Features · ${progress.done}/${progress.total} done`
                  : "Features"
              }
            >
              {progress ? (
                <div className="h-1.5 rounded-full bg-muted">
                  <div
                    className="h-1.5 rounded-full bg-primary"
                    style={{
                      width: `${Math.round((progress.done / progress.total) * 100)}%`,
                    }}
                  />
                </div>
              ) : null}
              {features.length ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {features.map((f) => (
                    <li key={f.title} className="flex items-center gap-2">
                      <span
                        className={
                          f.done
                            ? "size-3 rounded-full bg-primary"
                            : "size-3 rounded-full border"
                        }
                      />
                      <span
                        className={
                          f.done ? "text-muted-foreground line-through" : ""
                        }
                      >
                        {f.title}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Field>
          ) : null}

          {card.attachments?.length ? (
            <Field label="Attachments">
              <ul className="flex flex-col gap-1 text-sm">
                {card.attachments.map((a) => (
                  <li key={a.url}>
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-primary underline-offset-2 hover:underline"
                    >
                      <Paperclip className="size-3.5 shrink-0" />
                      {a.name}
                    </a>
                  </li>
                ))}
              </ul>
            </Field>
          ) : null}

          {card.ideas ? (
            <p className="text-sm text-muted-foreground">
              💡 Requested in {card.ideas} {card.ideas === 1 ? "idea" : "ideas"}
              .
            </p>
          ) : null}
        </TabsContent>

        {commentsEnabled ? (
          <TabsContent value="comments" className="px-6 py-5">
            <PublicComments target={{ cardId: card.id }} />
          </TabsContent>
        ) : null}
      </Tabs>
    </article>
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
