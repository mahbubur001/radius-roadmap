import { CalendarDays } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PublicCard } from "@/server/services/public-site";
import { VoteButton } from "./vote-button";

/** Full card view, shared by the card page and the board's drawer. */
export function CardDetail({
  card,
  columnName,
}: {
  card: PublicCard;
  columnName: string;
}) {
  const features = card.features ?? [];
  const done = features.filter((f) => f.done).length;
  return (
    <article className="flex flex-col gap-5">
      <header className="flex items-start gap-4">
        <VoteButton cardId={card.id} votes={card.votes} size="lg" />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {card.title}
          </h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{columnName}</Badge>
            {card.objective ? (
              <span className="flex items-center gap-1.5">
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: card.objective.color }}
                />
                {card.objective.name}
              </span>
            ) : null}
            {card.plannedFor ? (
              <span className="flex items-center gap-1">
                <CalendarDays className="size-3.5" />
                {new Date(`${card.plannedFor}T00:00:00`).toLocaleDateString(
                  "en",
                  { month: "short", year: "numeric" },
                )}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {card.html ? (
        <div
          className="rich-text"
          // Rendered from Tiptap JSON by the allow-list in src/lib/rich-text.ts.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: sanitized server-side
          dangerouslySetInnerHTML={{ __html: card.html }}
        />
      ) : null}

      {features.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            Features · {done}/{features.length} done
          </h2>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary"
              style={{
                width: `${Math.round((done / features.length) * 100)}%`,
              }}
            />
          </div>
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
                  className={f.done ? "text-muted-foreground line-through" : ""}
                >
                  {f.title}
                </span>
              </li>
            ))}
          </ul>
        </section>
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
    </article>
  );
}
