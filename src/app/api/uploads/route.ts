import { env } from "@/lib/env";
import {
  ATTACHMENT_TYPES,
  type AttachmentType,
  MAX_ATTACHMENT_BYTES,
} from "@/lib/schemas/upload";
import { writeLocalFile } from "@/server/storage";
import {
  isValidKey,
  maxBytesForKey,
  sniffFile,
  verifyUpload,
} from "@/server/storage/keys";

// Local storage driver only: accepts the same signed form S3 would (see
// createUpload in src/server/storage). With STORAGE_DRIVER=s3 it's disabled.
export async function POST(request: Request) {
  if (env.STORAGE_DRIVER !== "local") return text("Not found", 404);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_ATTACHMENT_BYTES + 64 * 1024) {
    return text("Too large", 413);
  }

  const form = await request.formData().catch(() => null);
  if (!form) return text("Bad request", 400);
  const key = String(form.get("key") ?? "");
  const contentType = String(form.get("Content-Type") ?? "");
  const expires = Number(form.get("expires"));
  const token = String(form.get("token") ?? "");
  const file = form.get("file");

  if (
    !isValidKey(key) ||
    !(contentType in ATTACHMENT_TYPES) ||
    !verifyUpload(env.BETTER_AUTH_SECRET, token, key, contentType, expires)
  ) {
    return text("Forbidden", 403);
  }
  if (!(file instanceof File) || file.size === 0) return text("No file", 400);
  // The key is signed, so its prefix (and so its size limit) can't be forged.
  if (file.size > maxBytesForKey(key)) return text("Too large", 413);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!sniffFile(bytes, contentType as AttachmentType)) {
    return text("Not a valid file", 400);
  }
  try {
    await writeLocalFile(key, bytes);
  } catch {
    return text("Already uploaded", 409);
  }
  return new Response(null, { status: 204 });
}

function text(body: string, status: number) {
  return new Response(body, { status });
}
