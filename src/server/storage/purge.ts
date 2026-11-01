import { rm } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

// Used by the worker (account deletion), so no "server-only" here or in
// anything it imports (see src/test/worker-imports.test.ts).

/** Delete every file under an account's prefix. Idempotent. */
export async function deletePrefix(prefix: string) {
  if (!/^accounts\/[^/.]+\/$/.test(prefix)) {
    throw new Error(`Refusing to delete prefix ${prefix}.`);
  }
  if (env.STORAGE_DRIVER !== "s3") {
    await rm(path.join(path.resolve(env.UPLOAD_DIR), prefix), {
      recursive: true,
      force: true,
    });
    return;
  }
  if (!env.S3_BUCKET) throw new Error("S3_BUCKET is not set.");
  const s3 = new S3Client({ region: env.AWS_REGION });
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: env.S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const objects = (page.Contents ?? []).flatMap((o) =>
      o.Key ? [{ Key: o.Key }] : [],
    );
    if (objects.length) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: env.S3_BUCKET,
          Delete: { Objects: objects },
        }),
      );
    }
    token = page.NextContinuationToken;
  } while (token);
}
