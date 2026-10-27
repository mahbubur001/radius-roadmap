/**
 * A same-site path to continue to after sign-in/up, or `fallback`. Rejects
 * absolute and protocol-relative URLs so `?next=` can't redirect off-site.
 */
export function safeNext(value: string | null | undefined, fallback: string) {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return fallback;
  if (value.includes("\\")) return fallback;
  return value;
}
