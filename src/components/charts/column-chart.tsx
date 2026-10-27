"use client";

import { useState } from "react";

// Single-series column chart (dataviz specs: bars <= 24px with a 4px rounded
// top and a 2px gap, hairline grid, one y-axis, per-bar tooltip on hover and
// keyboard focus, and a table view so no value is gated behind hover).

export type ColumnDatum = { key: string; label: string; value: number };

const HEIGHT = 180;
const AXIS = 32;

function niceMax(max: number) {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / step) * step;
}

function compact(n: number) {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(n);
}

export function ColumnChart({
  data,
  title,
  unit,
}: {
  data: ColumnDatum[];
  /** Names the series (single series: no legend). */
  title: string;
  /** Tooltip suffix, e.g. "views". */
  unit: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, max / 2, max];
  const slot = 100 / Math.max(data.length, 1);
  const hovered = active !== null ? data[active] : null;

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="text-sm font-medium">{title}</figcaption>
      <div className="relative" style={{ height: HEIGHT }}>
        {/* Gridlines + y-axis ticks */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute right-0 left-0 flex items-center"
            style={{
              bottom: `${(t / max) * 100}%`,
              transform: "translateY(50%)",
            }}
          >
            <span
              className="w-7 pr-1 text-right text-[10px] text-muted-foreground"
              style={{ marginRight: AXIS - 28 }}
            >
              {compact(t)}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>
        ))}
        {/* Columns */}
        <div
          className="absolute top-0 right-0 bottom-0 flex items-end"
          style={{ left: AXIS }}
        >
          {data.map((d, i) => (
            <button
              key={d.key}
              type="button"
              className="flex h-full items-end justify-center px-px outline-none"
              style={{ width: `${slot}%` }}
              aria-label={`${d.label}: ${d.value} ${unit}`}
              onPointerEnter={() => setActive(i)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
            >
              <span
                className="block w-full max-w-6 rounded-t bg-primary transition-opacity"
                style={{
                  height: `${(d.value / max) * 100}%`,
                  minHeight: d.value ? 2 : 0,
                  opacity: active === null || active === i ? 1 : 0.55,
                }}
              />
            </button>
          ))}
        </div>
        {hovered && active !== null ? (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-10 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: `calc(${AXIS}px + (100% - ${AXIS}px) * ${(active + 0.5) / data.length})`,
              // Keep the tooltip inside the chart near either edge.
              transform: `translate(${
                (active + 0.5) / data.length > 0.8
                  ? "-100%"
                  : (active + 0.5) / data.length < 0.2
                    ? "0"
                    : "-50%"
              }, calc(-100% - 4px))`,
            }}
          >
            <span className="font-semibold text-popover-foreground">
              {hovered.value.toLocaleString("en")}
            </span>{" "}
            <span className="text-muted-foreground">
              {unit} · {hovered.label}
            </span>
          </div>
        ) : null}
      </div>
      <div
        className="flex justify-between text-[10px] text-muted-foreground"
        style={{ paddingLeft: AXIS }}
      >
        <span>{data[0]?.label}</span>
        <span>{data.at(-1)?.label}</span>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">View as table</summary>
        <table className="mt-2 w-full max-w-xs">
          <thead>
            <tr>
              <th className="text-left font-medium">Day</th>
              <th className="text-right font-medium">{unit}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.key}>
                <td>{d.label}</td>
                <td className="text-right tabular-nums">{d.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
