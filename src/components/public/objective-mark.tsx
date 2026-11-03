/**
 * The objective's colour as a small square (doc 32 decision 18): same shape
 * as the status squares in the ideas ledger. The brand colour stays on the
 * line and the vote buttons.
 */
export function ObjectiveMark({ color }: { color: string }) {
  return (
    <i
      aria-hidden
      className="inline-block size-2 shrink-0 rounded-[2px]"
      style={{ backgroundColor: color }}
    />
  );
}
