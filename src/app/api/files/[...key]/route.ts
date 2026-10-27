import { env } from "@/lib/env";
import { readLocalFile } from "@/server/storage";
import { contentTypeForKey, isValidKey } from "@/server/storage/keys";

// Local storage driver only: serves uploaded files. Keys are random and never
// reused, so responses can be cached forever.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/files/[...key]">,
) {
  if (env.STORAGE_DRIVER !== "local") return notFound();
  const key = (await params).key.join("/");
  const contentType = contentTypeForKey(key);
  if (!isValidKey(key) || !contentType) return notFound();

  try {
    const bytes = await readLocalFile(key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return notFound();
  }
}

function notFound() {
  return new Response("Not found", { status: 404 });
}
