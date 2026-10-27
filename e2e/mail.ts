import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect } from "@playwright/test";

const MAIL_DIR = ".dev-mail";

type DevMail = { to: string; subject: string; text: string };

// Waits for the console email transport to write a message to `to`.
export async function waitForMail(to: string): Promise<DevMail> {
  let mail: DevMail | undefined;
  await expect
    .poll(
      async () => {
        const files = await readdir(MAIL_DIR).catch(() => []);
        const match = files
          .filter((f) => f.endsWith(`-${to}.json`))
          .sort()
          .at(-1);
        if (!match) return false;
        mail = JSON.parse(await readFile(join(MAIL_DIR, match), "utf8"));
        return true;
      },
      { timeout: 20_000, message: `no email for ${to}` },
    )
    .toBe(true);
  return mail as DevMail;
}

export function firstLink(text: string): string {
  const url = text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error("No link in email");
  return url;
}
