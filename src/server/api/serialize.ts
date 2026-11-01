// API JSON style (doc 27 A5), shared by the routes and webhook payloads
// (the worker imports it too, so no server-only imports here).

function snake(key: string) {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** camelCase keys → snake_case, Dates → ISO strings, recursively. */
export function serialize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [snake(k), serialize(v)]),
    );
  }
  return value;
}
