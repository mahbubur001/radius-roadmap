import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { r2 } from "./r2";

// Used by the worker (account deletion), so no "server-only" here or in
// anything it imports (see src/test/worker-imports.test.ts).

/** Delete every file under an account's prefix. Idempotent. */
export async function deletePrefix(prefix: string) {
  if (!/^accounts\/[^/.]+\/$/.test(prefix)) {
    throw new Error(`Refusing to delete prefix ${prefix}.`);
  }
  const { client, bucket } = r2();
  let token: string | undefined;
  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    const objects = (page.Contents ?? []).flatMap((o) =>
      o.Key ? [{ Key: o.Key }] : [],
    );
    if (objects.length) {
      await client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects },
        }),
      );
    }
    token = page.NextContinuationToken;
  } while (token);
}
