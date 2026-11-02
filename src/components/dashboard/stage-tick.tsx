import {
  STAGE_COLORS,
  STAGE_LABELS,
  STAGES,
  type Stage,
  stageStep,
} from "@/lib/stages";
import { cn } from "@/lib/utils";

/**
 * Six hairline bars: how far an idea or card has come, from New to Announced
 * (doc 30). `null` = declined (no bars filled). Works in server and client
 * components.
 */
export function StageTick({
  stage,
  className,
  label = true,
}: {
  stage: Stage | null;
  className?: string;
  /** Screen-reader label; off when visible text already names the stage. */
  label?: boolean;
}) {
  const filled = stage ? stageStep(stage) : 0;
  const color = stage ? STAGE_COLORS[stage] : undefined;
  const name = stage ? STAGE_LABELS[stage] : "Declined";
  const bars = STAGES.map((s, i) => (
    <i
      key={s}
      className="h-[11px] w-[3px] rounded-[1px] bg-border"
      style={i < filled ? { background: color } : undefined}
    />
  ));
  const classes = cn("inline-flex shrink-0 items-center gap-0.5", className);
  return label ? (
    <span role="img" aria-label={name} title={name} className={classes}>
      {bars}
    </span>
  ) : (
    <span aria-hidden="true" title={name} className={classes}>
      {bars}
    </span>
  );
}
