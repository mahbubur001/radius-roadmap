// Browser side of an upload (doc 29 T11): send the file straight to R2 with
// the presigned PUT the server handed out.

export async function putFile(
  target: { url: string; method: "PUT"; headers: Record<string, string> },
  file: File,
) {
  const res = await fetch(target.url, {
    method: target.method,
    headers: target.headers,
    body: file,
  });
  if (!res.ok) {
    throw new Error(
      res.status === 413
        ? "That file is too large."
        : "Upload failed. Try again.",
    );
  }
}
