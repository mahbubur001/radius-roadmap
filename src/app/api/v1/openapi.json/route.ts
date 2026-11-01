import { openApiDocument } from "@/server/api/openapi";
import { appOrigin } from "@/server/public-url";

/** OpenAPI 3.1 description of /api/v1 (doc 27 A7). Public. */
export function GET() {
  return Response.json(openApiDocument(appOrigin()), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
