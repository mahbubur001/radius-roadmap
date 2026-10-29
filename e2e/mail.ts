import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";

const MAIL_DIR = ".dev-mail";

type DevMail = { to: string; subject: string; text: string; html: string };

/** Waits for the console email transport to write a message to `to`. */
export async function waitForMail(
  to: string,
  subject?: string,
): Promise<DevMail> {
  let mail: DevMail | undefined;
  await expect
    .poll(
      async () => {
        const files = (await readdir(MAIL_DIR).catch(() => []))
          .filter((f) => f.endsWith(`-${to}.json`))
          .sort()
          .reverse();
        for (const f of files) {
          const m: DevMail = JSON.parse(
            await readFile(join(MAIL_DIR, f), "utf8"),
          );
          if (!subject || m.subject.includes(subject)) {
            mail = m;
            return true;
          }
        }
        return false;
      },
      { timeout: 20_000, message: `no email for ${to} (${subject ?? "any"})` },
    )
    .toBe(true);
  return mail as DevMail;
}

export function firstLink(text: string): string {
  const url = text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("No link in email");
  return url;
}
