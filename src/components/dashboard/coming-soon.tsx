export function ComingSoon({ title, phase }: { title: string; phase: string }) {
  return (
    <div className="mx-auto max-w-5xl">
      <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Coming in {phase}. See docs/PROGRESS.md.
      </p>
    </div>
  );
}
