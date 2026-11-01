import { z } from "zod";

// A customer's own domain for its public site (doc 26 6D, D1). Shared by the
// settings form and the service; the service adds the checks that need the
// environment (not our app domain, *.localhost only in development).

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** "https://Feedback.Acme.com/roadmap" → "feedback.acme.com". */
export function normalizeHostname(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/\.$/, "");
}

/** True for a host under a domain someone owns: `feedback.acme.com`. */
export function isCustomHostname(host: string) {
  if (host.length > 253) return false;
  const labels = host.split(".");
  if (!labels.every((l) => LABEL.test(l))) return false;
  // Dev hosts (`acme.localhost`) need two labels; real ones three, because
  // a root domain like acme.com can't have a CNAME (D1).
  if (labels.at(-1) === "localhost") return labels.length >= 2;
  // The top-level domain has a letter, so IP addresses don't pass.
  return labels.length >= 3 && /[a-z]/.test(labels.at(-1) ?? "");
}

export const domainSchema = z.object({
  hostname: z
    .string()
    .max(300)
    .transform(normalizeHostname)
    .refine(
      isCustomHostname,
      "Enter a domain you own, like feedback.yourcompany.com",
    ),
});

export type DomainInput = z.input<typeof domainSchema>;
