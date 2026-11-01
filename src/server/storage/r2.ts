import { S3Client } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

// Cloudflare R2, the only file storage (doc 29 T11). Spoken to through its S3
// API with the AWS SDK. Worker-safe: no server-only imports (account deletion
// runs in the worker).

let client: S3Client | undefined;

export function r2(): { client: S3Client; bucket: string } {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET
  ) {
    throw new Error(
      "File storage isn't set up: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET must be set.",
    );
  }
  client ??= new S3Client({
    region: "auto", // required by the SDK, not used by R2
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
  return { client, bucket: env.R2_BUCKET };
}
