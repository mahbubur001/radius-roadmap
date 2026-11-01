import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Forbidden } from "@/components/dashboard/forbidden";
import { SettingsSection } from "@/components/dashboard/settings-section";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { openApiDocument } from "@/server/api/openapi";
import { appOrigin } from "@/server/public-url";
import { seesAllWorkspaces } from "@/server/services/context";
import { requireWorkspace } from "@/server/session";

export const metadata: Metadata = { title: "API reference" };

type Schema = {
  type?: string | string[];
  properties?: Record<string, Schema>;
  required?: string[];
  description?: string;
  enum?: string[];
  format?: string;
  $ref?: string;
  items?: Schema;
  anyOf?: Schema[];
};
type Operation = {
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: { name: string; in: string; schema: Schema }[];
  requestBody?: { content: { "application/json": { schema: Schema } } };
};

export default function ApiReferencePage({
  params,
}: PageProps<"/dashboard/[workspace]/settings/api/reference">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Reference slug={params.then((p) => p.workspace)} />
    </Suspense>
  );
}

function typeOf(s: Schema | undefined): string {
  if (!s) return "";
  if (s.$ref) return s.$ref.split("/").pop() ?? "";
  if (s.anyOf) return s.anyOf.map(typeOf).join(" | ");
  if (s.enum) return s.enum.map((e) => `"${e}"`).join(" | ");
  if (s.type === "array") return `${typeOf(s.items)}[]`;
  const t = Array.isArray(s.type) ? s.type.join(" | ") : (s.type ?? "");
  return s.format ? `${t} (${s.format})` : t;
}

/** Field list of an object schema. */
function Fields({ schema }: { schema: Schema | undefined }) {
  const props = Object.entries(schema?.properties ?? {});
  if (!props.length) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {props.map(([name, s]) => (
        <li key={name}>
          <code className="font-medium">{name}</code>{" "}
          <span className="text-muted-foreground">
            {typeOf(s)}
            {schema?.required?.includes(name) ? ", required" : ""}
            {s.description ? ` — ${s.description}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

async function Reference({ slug }: { slug: Promise<string> }) {
  const ctx = await requireWorkspace(await slug);
  if (!seesAllWorkspaces(ctx)) return <Forbidden what="the API reference" />;
  const doc = openApiDocument(appOrigin());
  const schemas = doc.components.schemas as Record<string, Schema>;
  const resolve = (s: Schema) =>
    s.$ref ? schemas[s.$ref.split("/").pop() ?? ""] : s;

  return (
    <>
      <SettingsSection
        title="API reference"
        description={`Base URL ${appOrigin()}/api/v1. Send your key as "Authorization: Bearer <key>". JSON in and out, snake_case. Lists return { data, next_cursor }; pass next_cursor as cursor for the next page. 100 requests a minute per key.`}
      >
        <p className="text-sm">
          <Link
            href={`/dashboard/${ctx.workspaceSlug}/settings/api`}
            className="text-primary underline"
          >
            Your API keys
          </Link>{" "}
          ·{" "}
          <a href="/api/v1/openapi.json" className="text-primary underline">
            openapi.json
          </a>{" "}
          (import it into Postman, Insomnia or a code generator)
        </p>
        <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs">
          {`curl ${appOrigin()}/api/v1/roadmap-cards?limit=10 \\\n  -H "Authorization: Bearer rr_live_…"`}
        </pre>
      </SettingsSection>

      {Object.entries(doc.paths).map(([path, ops]) =>
        Object.entries(ops as Record<string, Operation>).map(([method, op]) => (
          <SettingsSection
            key={`${method} ${path}`}
            title={
              <>
                <Badge variant={method === "get" ? "secondary" : "default"}>
                  {method.toUpperCase()}
                </Badge>
                <code>{path}</code>
              </>
            }
            description={[op.summary, op.description]
              .filter(Boolean)
              .join(". ")}
          >
            {op.parameters?.some((p) => p.in === "query") ? (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Query parameters</p>
                <Fields
                  schema={{
                    properties: Object.fromEntries(
                      op.parameters
                        .filter((p) => p.in === "query")
                        .map((p) => [p.name, p.schema]),
                    ),
                  }}
                />
              </div>
            ) : null}
            {op.requestBody ? (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">Body</p>
                <Fields
                  schema={resolve(
                    op.requestBody.content["application/json"].schema,
                  )}
                />
              </div>
            ) : null}
          </SettingsSection>
        )),
      )}

      <SettingsSection title="Objects">
        {Object.entries(schemas)
          .filter(
            ([name]) =>
              !/^(Create|Update[A-Z])/.test(name) || name === "Update",
          )
          .map(([name, s]) => (
            <div key={name} className="flex flex-col gap-1">
              <p className="font-medium">{name}</p>
              <Fields schema={s} />
            </div>
          ))}
      </SettingsSection>
    </>
  );
}
