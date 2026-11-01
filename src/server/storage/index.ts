import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  type AttachmentType,
  isImageType,
  MAX_IMAGE_BYTES,
} from "@/lib/schemas/upload";
import { contentTypeForKey, isValidKey, newKey, sniffFile } from "./keys";
import { r2 } from "./r2";

export { prefixes } from "./keys";
export { fileUrl } from "./url";

// Files live on Cloudflare R2 (doc 29 T11). Uploads go straight from the
// browser to R2 with a presigned PUT (R2 has no presigned POST); the app hands
// out the signed request and records the key after checkUploaded().

const UPLOAD_TTL_SECONDS = 300;

/** What the browser sends: `fetch(url, { method, headers, body: file })`. */
export type UploadTarget = {
  key: string;
  url: string;
  method: "PUT";
  headers: Record<string, string>;
};

/**
 * A signed PUT for one file of `contentType` and exactly `size` bytes under
 * `prefix`. Type and length are part of the signature, so the bucket
 * refuses anything else; non-images are stored as downloads.
 */
export async function createUpload(
  prefix: string,
  contentType: AttachmentType,
  size: number,
  maxBytes = MAX_IMAGE_BYTES,
): Promise<UploadTarget> {
  if (!Number.isInteger(size) || size < 1 || size > maxBytes) {
    throw new Error("File too large.");
  }
  const key = newKey(prefix, contentType);
  const disposition = isImageType(contentType) ? null : "attachment";
  const headers: Record<string, string> = {
    "content-type": contentType,
    ...(disposition ? { "content-disposition": disposition } : {}),
  };

  const url = await presignPut(r2(), key, contentType, size, disposition);
  return { key, url, method: "PUT", headers };
}

/** The presigned PUT URL; content type, length (and disposition) signed. */
export function presignPut(
  remote: { client: S3Client; bucket: string },
  key: string,
  contentType: string,
  size: number,
  disposition: string | null,
) {
  return getSignedUrl(
    remote.client,
    new PutObjectCommand({
      Bucket: remote.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
      ...(disposition ? { ContentDisposition: disposition } : {}),
    }),
    {
      expiresIn: UPLOAD_TTL_SECONDS,
      signableHeaders: new Set([
        "content-type",
        "content-length",
        ...(disposition ? ["content-disposition"] : []),
      ]),
    },
  );
}

/**
 * Before a key is saved: the file exists, is at most `maxBytes`, and starts
 * with the magic bytes of its type (nothing checked it on the way into R2).
 * A file that fails is deleted.
 */
export async function checkUploaded(key: string, maxBytes: number) {
  const size = await fileSize(key);
  const type = contentTypeForKey(key);
  let ok = size !== null && size > 0 && size <= maxBytes && type !== null;
  if (ok && type) {
    try {
      const { client, bucket } = r2();
      const head = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: key, Range: "bytes=0-15" }),
      );
      const bytes =
        (await head.Body?.transformToByteArray()) ?? new Uint8Array();
      ok = sniffFile(bytes, type);
    } catch {
      ok = false;
    }
  }
  if (!ok && size !== null) await deleteFile(key);
  return ok ? (size as number) : null;
}

/** Size in bytes if the object exists, else null. */
export async function fileSize(key: string): Promise<number | null> {
  if (!isValidKey(key)) return null;
  try {
    const { client, bucket } = r2();
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: key }),
    );
    return head.ContentLength ?? null;
  } catch {
    return null;
  }
}

/** Best-effort delete (used when an image is replaced or removed). */
export async function deleteFile(key: string | null | undefined) {
  if (!key || !isValidKey(key)) return;
  try {
    const { client, bucket } = r2();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  } catch (error) {
    console.error("[storage] delete failed", key, error);
  }
}
