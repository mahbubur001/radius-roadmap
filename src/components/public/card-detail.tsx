"use client";

import {
  ArrowUp,
  CalendarDays,
  Lightbulb,
  MessagesSquare,
  Paperclip,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PHONE, useMedia } from "@/lib/use-media";
import type { PublicCard } from "@/server/services/public-site";
import { PublicComments } from "./public-comments";
import { VoteButton } from "./vote-button";

/**
 * Full card view, shared by the card page and the board's drawer (doc 22
 * step 3): title and vote on top, then Details / Comments tabs.
 */
export function CardDetail({
  card,
  columnName,
  commentsEnabled,
  initialTab = "details",
  ideasBase,
}: {
  /** Link base for "Requested in" ideas (null when Ideas is switched off). */
  ideasBase?: string | null;
  card: PublicCard;
  columnName: string;
  commentsEnabled: boolean;
  /** Open on Comments when the visitor clicked a card's comment count. */
  initialTab?: "details" | "comments";
}) {
  const features = card.features ?? [];
  const progress = card.progress;
  const phone = useMedia(PHONE);
  if (phone) {
    return (
      <PhoneCard
        card={card}
        columnName={columnName}
        commentsEnabled={commentsEnabled}
        ideasBase={ideasBase ?? null}
      />
    );
  }
  return (
    <article
      className="flex flex-col border-t-4"
      // The objective's colour across the top, like the bar on board cards.
      style={{ borderTopColor: card.objective?.color ?? "var(--border)" }}
    >
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
        <VoteButton cardId={card.id} votes={card.votes} variant="plain" />
      </header>

      <Tabs
        defaultValue={commentsEnabled ? initialTab : "details"}
        className="gap-0"
      >
        <TabsList variant="line" className="mx-6 mt-8 [&>[role=tab]]:pb-4">
          <TabsTrigger value="details">Details</TabsTrigger>
          {commentsEnabled ? (
            <TabsTrigger value="comments">
              Comments ({card.comments})
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent
          value="details"
          className="flex flex-col gap-5 px-6 pt-6 pb-5"
        >
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

          {card.requestedIn?.length ? (
            <Field label="Requested in">
              <RequestedIn
                ideas={card.requestedIn}
                ideasBase={ideasBase ?? null}
              />
            </Field>
          ) : card.ideas ? (
            <p className="text-sm text-muted-foreground">
              💡 Requested in {card.ideas} {card.ideas === 1 ? "idea" : "ideas"}
              .
            </p>
          ) : null}
        </TabsContent>

        {commentsEnabled ? (
          <TabsContent value="comments" className="px-6 pt-7 pb-5">
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

/** Linked ideas, most votes first; links when the Ideas page is on. */
function RequestedIn({
  ideas,
  ideasBase,
}: {
  ideas: NonNullable<PublicCard["requestedIn"]>;
  ideasBase: string | null;
}) {
  return (
    <ul className="flex flex-col gap-1.5">
      {ideas.map((i) => {
        const body = (
          <>
            <Lightbulb className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{i.title}</span>
            <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-muted-foreground">
              <ArrowUp className="size-3.5" />
              {i.votes}
            </span>
          </>
        );
        const row =
          "flex items-center gap-2.5 rounded-xl bg-muted/60 px-3 py-3 text-sm";
        return (
          <li key={i.slug}>
            {ideasBase ? (
              <a
                href={`${ideasBase}/${i.slug}`}
                className={`${row} hover:bg-muted`}
              >
                {body}
              </a>
            ) : (
              <span className={row}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The card on a phone (doc 31): one scrolling page, no tabs. Status, title
 * and a short meta line, a full-width vote button, then the description,
 * the ideas it was requested in, and the comments.
 */
function PhoneCard({
  card,
  columnName,
  commentsEnabled,
  ideasBase,
}: {
  card: PublicCard;
  columnName: string;
  commentsEnabled: boolean;
  ideasBase: string | null;
}) {
  const section =
    "mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase";
  return (
    <article className="flex flex-col">
      {card.image ? (
        // biome-ignore lint/performance/noImgElement: tenant uploads on any host
        <img
          src={card.image}
          alt=""
          className="mx-4 mt-2 aspect-[3/1] rounded-xl object-cover"
        />
      ) : null}
      <header className="flex flex-col gap-3 px-5 pt-4 pb-5">
        <span className="inline-flex h-7 w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 text-xs font-medium text-primary">
          <span className="size-1.5 rounded-full bg-primary" />
          {card.completed ? "Done" : columnName}
        </span>
        {card.objective ? (
          <span className="-mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: card.objective.color }}
            />
            {card.objective.name}
          </span>
        ) : null}
        <h1 className="pr-6 text-[22px] leading-tight font-semibold tracking-tight">
          {card.title}
        </h1>
        {card.plannedFor || (commentsEnabled && card.comments) ? (
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {card.plannedFor ? (
              <span className="flex items-center gap-1.5">
                <CalendarDays className="size-4" />
                Planned for{" "}
                {new Date(`${card.plannedFor}T00:00:00`).toLocaleDateString(
                  "en",
                  { month: "short", year: "numeric" },
                )}
              </span>
            ) : null}
            {commentsEnabled && card.comments ? (
              <span className="flex items-center gap-1.5">
                <MessagesSquare className="size-4" />
                {card.comments} {card.comments === 1 ? "comment" : "comments"}
              </span>
            ) : null}
          </p>
        ) : null}
        <VoteButton cardId={card.id} votes={card.votes} variant="big" />
      </header>

      <div className="flex flex-col gap-6 px-5 pb-8">
        {card.html ? (
          <div
            className="rich-text text-[15px] leading-relaxed"
            // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
            // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
            dangerouslySetInnerHTML={{ __html: card.html }}
          />
        ) : null}

        {card.tags.length ? (
          <div className="flex flex-wrap gap-1.5">
            {card.tags.map((t) => (
              <Badge key={t} variant="outline">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}

        {card.progress || card.features?.length ? (
          <section>
            <h2 className={section}>
              {card.progress
                ? `Features · ${card.progress.done}/${card.progress.total} done`
                : "Features"}
            </h2>
            <ul className="flex flex-col gap-2 text-[15px]">
              {(card.features ?? []).map((f) => (
                <li key={f.title} className="flex items-center gap-2.5">
                  <span
                    className={
                      f.done
                        ? "size-3.5 rounded-full bg-primary"
                        : "size-3.5 rounded-full border"
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
          </section>
        ) : null}

        {card.attachments?.length ? (
          <section>
            <h2 className={section}>Attachments</h2>
            <ul className="flex flex-col gap-2 text-[15px]">
              {card.attachments.map((a) => (
                <li key={a.url}>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-primary"
                  >
                    <Paperclip className="size-4 shrink-0" />
                    {a.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {card.requestedIn?.length ? (
          <section>
            <h2 className={section}>Requested in</h2>
            <RequestedIn ideas={card.requestedIn} ideasBase={ideasBase} />
          </section>
        ) : null}

        {commentsEnabled ? (
          <section>
            <h2 className={section}>Comments</h2>
            <PublicComments target={{ cardId: card.id }} />
          </section>
        ) : null}
      </div>
    </article>
  );
}
