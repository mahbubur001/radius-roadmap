import "server-only";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { env } from "@/lib/env";
import {
  type AttachmentType,
  isImageType,
  MAX_IMAGE_BYTES,
} from "@/lib/schemas/upload";
import { isValidKey, newKey, signUpload } from "./keys";

export { prefixes } from "./keys";
export { fileUrl } from "./url";

// Uploads go straight from the browser to storage (S3 presigned POST, or the
// local /api/uploads route that mimics it). The app only hands out a signed
// form and later records the key. See doc 18 §4.4.

const UPLOAD_TTL_SECONDS = 300;

export type UploadForm = {
  key: string;
  url: string;
  fields: Record<string, string>;
};

let s3: S3Client | undefined;
function s3Client() {
  s3 ??= new S3Client({ region: env.AWS_REGION });
  return s3;
}

function bucket() {
  if (!env.S3_BUCKET) throw new Error("S3_BUCKET is not set.");
  return env.S3_BUCKET;
}

/** A signed form the browser POSTs the file to (field `file` last). */
export async function createUpload(
  prefix: string,
  contentType: AttachmentType,
  maxBytes = MAX_IMAGE_BYTES,
): Promise<UploadForm> {
  const key = newKey(prefix, contentType);

  if (env.STORAGE_DRIVER === "s3") {
    // Anything that isn't an image is served as a download.
    const disposition = isImageType(contentType) ? null : "attachment";
    const { url, fields } = await createPresignedPost(s3Client(), {
      Bucket: bucket(),
      Key: key,
      Conditions: [
        ["content-length-range", 1, maxBytes],
        ["eq", "$Content-Type", contentType],
        ...(disposition ? [{ "Content-Disposition": disposition }] : []),
      ],
      Fields: {
        "Content-Type": contentType,
        ...(disposition ? { "Content-Disposition": disposition } : {}),
      },
      Expires: UPLOAD_TTL_SECONDS,
    });
    return { key, url, fields };
  }

  const expires = Date.now() + UPLOAD_TTL_SECONDS * 1000;
  return {
    key,
    url: "/api/uploads",
    fields: {
      key,
      "Content-Type": contentType,
      expires: String(expires),
      token: signUpload(env.BETTER_AUTH_SECRET, key, contentType, expires),
    },
  };
}

function localPath(key: string) {
  if (!isValidKey(key)) throw new Error("Invalid storage key.");
  return path.join(path.resolve(env.UPLOAD_DIR), key);
}

/** Size in bytes if the object exists, else null. */
export async function fileSize(key: string): Promise<number | null> {
  if (!isValidKey(key)) return null;
  try {
    if (env.STORAGE_DRIVER === "s3") {
      const head = await s3Client().send(
        new HeadObjectCommand({ Bucket: bucket(), Key: key }),
      );
      return head.ContentLength ?? null;
    }
    return (await stat(localPath(key))).size;
  } catch {
    return null;
  }
}

/** Best-effort delete (used when an image is replaced or removed). */
export async function deleteFile(key: string | null | undefined) {
  if (!key || !isValidKey(key)) return;
  try {
    if (env.STORAGE_DRIVER === "s3") {
      await s3Client().send(
        new DeleteObjectCommand({ Bucket: bucket(), Key: key }),
      );
    } else {
      await rm(localPath(key), { force: true });
    }
  } catch (error) {
    console.error("[storage] delete failed", key, error);
  }
}

// Local driver only: used by the /api/uploads and /api/files route handlers.

export async function writeLocalFile(key: string, bytes: Uint8Array) {
  const file = localPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes, { flag: "wx" });
}

export async function readLocalFile(key: string) {
  return readFile(localPath(key));
}
