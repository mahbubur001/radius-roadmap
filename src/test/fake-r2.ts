import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from "@aws-sdk/client-s3";

// In-memory stand-in for the R2 bucket in unit tests (no network). It answers
// the commands src/server/storage sends, so that code runs for real. Use:
//   vi.mock("@/server/storage/r2", () => import("@/test/fake-r2"));

const objects = new Map<string, Uint8Array>();

/** Put a file "in the bucket", as if the browser had uploaded it. */
export function putTestObject(key: string, bytes: Uint8Array) {
  objects.set(key, bytes);
}

const client = {
  async send(command: unknown) {
    if (command instanceof HeadObjectCommand) {
      const bytes = objects.get(command.input.Key ?? "");
      if (!bytes)
        throw Object.assign(new Error("NotFound"), { name: "NotFound" });
      return { ContentLength: bytes.length };
    }
    if (command instanceof GetObjectCommand) {
      const bytes = objects.get(command.input.Key ?? "");
      if (!bytes)
        throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
      const [, from = "0", to] =
        /bytes=(\d+)-(\d+)?/.exec(command.input.Range ?? "") ?? [];
      const slice = bytes.slice(Number(from), to ? Number(to) + 1 : undefined);
      return { Body: { transformToByteArray: async () => slice } };
    }
    if (command instanceof DeleteObjectCommand) {
      objects.delete(command.input.Key ?? "");
      return {};
    }
    if (command instanceof ListObjectsV2Command) {
      const prefix = command.input.Prefix ?? "";
      return {
        Contents: [...objects.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((Key) => ({ Key })),
      };
    }
    if (command instanceof DeleteObjectsCommand) {
      for (const o of command.input.Delete?.Objects ?? [])
        objects.delete(o.Key ?? "");
      return {};
    }
    throw new Error(`fake R2: unexpected command ${String(command)}`);
  },
} as unknown as S3Client;

export function r2() {
  return { client, bucket: "test-bucket" };
}
