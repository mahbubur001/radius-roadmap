import {
  STAGE_COLORS,
  STAGE_LABELS,
  STAGES,
  type Stage,
  stageStep,
} from "@/lib/stages";
import { cn } from "@/lib/utils";

/** The six stages in a row, filled up to `stage` (card drawer, doc 30). */
export function StageJourney({
  stage,
  className,
}: {
  stage: Stage;
  className?: string;
}) {
  const step = stageStep(stage);
  return (
    <ol
      aria-label={`Stage: ${STAGE_LABELS[stage]}`}
      className={cn("flex rounded-xl bg-muted p-3", className)}
    >
      {STAGES.map((s, i) => {
        const done = i + 1 < step;
        const now = i + 1 === step;
        return (
          <li
            key={s}
            aria-current={now ? "step" : undefined}
            className={cn(
              "flex flex-1 flex-col gap-1.5 text-[11px] text-faint",
              now && "font-medium text-foreground",
            )}
          >
            <span
              className="mr-1 h-1 rounded-full bg-input"
              style={
                done || now
                  ? {
                      background: STAGE_COLORS[stage],
                      boxShadow: now
                        ? `0 0 0 3px color-mix(in oklab, ${STAGE_COLORS[stage]} 25%, transparent)`
                        : undefined,
                    }
                  : undefined
              }
            />
            <span className="truncate">{STAGE_LABELS[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}
