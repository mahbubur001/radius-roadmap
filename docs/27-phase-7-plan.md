# 27 — Phase 7 plan: Public REST API + outgoing webhooks

Status: **APPROVED and BUILT 2026-11-01** (A1–A12 as recommended; see §7 "As built"). **Phase 7 done.**

Why this first from the "Later" list: the WordPress plugin, Jira sync, Zapier/Make and customers' own tools all build on an API and webhooks. Doing it first means the later integrations reuse it instead of each adding a private channel.

Sources:
- doc 10 (LoopedIn: REST API on Enterprise, `Authorization: Bearer <key>`, 100 req/min, resources; webhooks on Pro, `{ event, date, data }`, 33 events)
- doc 11 / doc 26 P7 (gates: API = Enterprise, webhooks = Pro)
- doc 14 (API = Route Handlers under `/api/v1/*`, Better Auth `apiKey`, OpenAPI from Zod; webhooks = events table + BullMQ delivery with HMAC signatures)

What exists today:
- Services for every resource (`roadmaps`, `feedback`, `updates`, `articles`, …) taking an `AccountContext` / `WorkspaceContext`, with tenant tests.
- `features: "api" | "webhooks"` in `src/lib/plans.ts` (Enterprise / Pro), unused.
- BullMQ `notify` queue + worker, `hit()` Redis rate limiter, `widget_keys` (one secret per account, show/rotate UI) as a pattern for secrets.
- Plan gates, upgrade toasts, Settings layout.

---

## 1. Decisions (my recommendation first)

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| A1 | How API keys are stored | **Our own `api_keys` table** (SHA-256 hash, a visible prefix like `rr_live_ab12…`, name, created by, last used). Shown once on creation. **No new dependency.** Better Auth's API key plugin moved to a separate package (`@better-auth/api-key`) in 1.7, adds its own HTTP endpoints we'd have to disable (like the organization ones), and writes to the database on every request for its counters | Better Auth `apiKey` plugin as doc 14 listed (new dependency) |
| A2 | Key scope | **Per account** (all its workspaces), with a **read-only** or **read + write** permission per key. Max 10 keys per account | Per-workspace keys |
| A3 | Who the key acts as | The key's creator with the admin role. When that person leaves the account, their keys are revoked (owners see and can revoke all keys) | A separate "API" pseudo-user |
| A4 | Rate limit | **100 requests / minute per key** (Redis, `hit()`), `429` with `Retry-After` and `X-RateLimit-*` headers | Per IP (LoopedIn) |
| A5 | JSON style | **snake_case**, ISO dates, `{ "data": … }` for one item, `{ "data": [...], "next_cursor": "…" | null }` for lists (cursor pagination, `limit` ≤ 100). Errors `{ "error": { "code", "message" } }` with 400/401/403/404/409/422/429 | camelCase; page numbers |
| A6 | Resources in v1 | Read: account, workspaces, roadmaps (+ columns), roadmap cards, objectives, feedback boards, feedback (ideas), statuses, updates, articles. Write: **cards** (create / update / delete), **feedback** (create / update / delete, change status, merge not in v1), **updates** (create draft / update / publish / delete). Articles write, comments and votes later | Read-only v1 |
| A7 | API docs | **OpenAPI 3.1 JSON at `/api/v1/openapi.json`, built from the same Zod schemas** (Zod 4's built-in `z.toJSONSchema`, no new dependency), plus a readable reference page in the dashboard (Settings → API) | Hosted Swagger/Redoc via a library |
| A8 | Webhook events (v1) | 18 events matching what we have: `feedback.created / updated / deleted / status_changed / pushed_to_roadmap / vote_added / vote_removed`, `roadmap_card.created / updated / deleted / completed / vote_added / vote_removed`, `update.published / unpublished`, `comment.created`, `subscriber.added / removed`. Payload `{ id, event, created_at, account_id, data }` | All 33 LoopedIn events |
| A9 | Delivery and security | BullMQ job per delivery, **HMAC-SHA256 signature** header `X-RadiusRoadmap-Signature: t=<unix>,v1=<hex>` over `t.body` (Stripe style, replay-safe), 10 s timeout, 8 retries with backoff (~1 day). **SSRF guard:** HTTPS only, the host must resolve to public IPs (no private, loopback, link-local or cloud metadata addresses), redirects not followed. Checked at save and again at every delivery | Plain shared-secret header |
| A10 | Failing endpoints | Delivery log (last 100 per endpoint: event, status, duration, response snippet) in the UI with "Resend". After **3 days of only failures** the endpoint is switched off and the owners get an email | Keep retrying forever |
| A11 | Where events are emitted | In the **services**, right after a successful write (so the dashboard, public site, widget and API all emit the same events), through a small producer `emitEvent()` that enqueues ids only and does nothing when the account has no endpoint for that event | In each server action / route |
| A12 | Plan gates | As doc 26 P7: **API = Enterprise**, **webhooks = Pro**. With billing off (dev, self-hosting) both are on | Both on Pro |

---

## 2. Data (migration `0015`)

- `api_keys`: id, account_id → organization (cascade), name, prefix (first 12 chars, shown), key_hash (sha256, unique), permission `read | write`, created_by → user (cascade), last_used_at (updated at most once a minute), created_at, revoked_at.
- `webhook_endpoints`: id, account_id, url, description, events text[], secret (shown on demand, rotate), enabled, disabled_reason, created_by, created_at, failing_since.
- `webhook_deliveries`: id, endpoint_id (cascade), event, event_id, payload jsonb, status `pending | success | failed`, attempts, response_status, response_snippet (≤ 1 KB), duration_ms, next_retry_at, created_at, delivered_at. Old rows pruned (keep 100 per endpoint, 30 days).

## 3. Code

- `src/server/api/` — `apiRoute(handler, { permission })`: reads `Authorization: Bearer`, verifies the key (hash lookup, plan gate `api`, not revoked), rate-limits, builds the `AccountContext`, maps service errors to the A5 error shape, adds CORS for GET (no cookies). `serialize()` → snake_case. `paginate()` → cursor (base64 of `created_at,id`).
- `src/lib/schemas/api/*` — Zod schemas for every request and response (the OpenAPI document is generated from them).
- `src/app/api/v1/**/route.ts` — one file per resource, thin: parse → service → serialize.
- `src/server/services/api-keys.ts`, `webhooks.ts` (endpoints, deliveries, `emitEvent`, `buildPayload`, `signPayload`, `assertPublicUrl`).
- `src/jobs/webhooks.ts` + a `webhooks` queue in the worker (concurrency 10).
- Settings → **API** (Enterprise): keys list, create (name + permission; key shown once with copy), revoke; link to the reference page and `openapi.json`. Settings → **Webhooks** (Pro): endpoints list, add/edit (URL, events checklist grouped by resource), signing secret (reveal / rotate), "Send test event", delivery log with Resend, enable/disable.
- Proxy: `/api/v1/*` stays app-domain only (already: custom hosts serve only `/api/public` and `/api/files`).

## 4. Steps (each: tests, lint, typecheck, commit)

1. **API keys:** migration `0015` (all three tables), `api-keys` service (create returns the key once, hash lookup, revoke, revoke on member removal, max 10), Settings → API page. Tests: tenant isolation, revoked/foreign keys rejected, plan gate, member removal.
2. **API foundation + read endpoints:** `apiRoute`, serializer, pagination, rate limit, error shape, all A6 read endpoints, `openapi.json` + reference page. Tests: each endpoint scoped to the key's account, pagination, 401/403/404/429.
3. **API writes:** cards, feedback, updates (create / update / delete / publish) through the existing services, with cache invalidation (`invalidatePublic`) like the dashboard actions. Tests: read-only key gets 403, validation errors 422, other account's ids 404.
4. **Webhooks:** endpoints service + Settings → Webhooks, `emitEvent` calls in the services (A11), worker delivery with signature, retries, SSRF guard, delivery log, Resend, test event, auto-disable + owner email. Tests: signature verifies, private URLs refused (including DNS that resolves to 127.0.0.1 / 169.254.169.254), retry → success, 3-day failure → disabled, events only for subscribed endpoints, payload has no other account's data.
5. **e2e + docs:** Playwright: create a key → `curl`-style requests via `request` (list cards, create feedback) → revoke → 401; add a webhook pointing at a local test receiver → vote on the public site → delivery logged with a valid signature. "As built", PROGRESS, CLAUDE.md (API + webhook rules).

## 5. Not in Phase 7

- OAuth apps / "Sign in with Radius Roadmap" for third parties; Zapier app listing (needs the API first; later).
- API for comments, votes, articles (write), subscribers, team; bulk endpoints.
- Jira sync, WordPress plugin, AI tagging, SSO/SAML (their own phases).

## 6. Done when

- [x] An Enterprise owner creates a key, calls every v1 endpoint for their account only, and a revoked key stops working at once.
- [x] Writes through the API show up on the dashboard and public site like dashboard edits.
- [x] A Pro owner adds a webhook, receives signed events for the selected types, sees deliveries, and a dead endpoint is switched off with an email.
- [x] `openapi.json` validates and matches the routes.
- [x] Checks green (unit, e2e, lint, typecheck, build).

## 7. As built (2026-11-01)

- **Schema (`0015_api_webhooks`):** `api_keys`, `webhook_endpoints`, `webhook_deliveries` (+ enums `api_key_permission`, `webhook_delivery_status`).
- **API keys** (`services/api-keys.ts`): `rr_live_` + 24 random bytes, SHA-256 hash stored, prefix shown; `verifyApiKey` joins `member` so a key works only while its creator is an owner/admin (demotion pauses it, removal/leaving revokes it via `revokeKeysOf` in `team.ts`); plan gate `api`; `last_used_at` written at most once a minute. Settings → **API** (create with name + access, key shown once in a dialog, list, revoke).
- **API** (`src/server/api/`): `apiRoute()` (bearer → key → write permission → 100/min per key via `hit()` → handler → snake_case JSON; errors `{ error: { code, message } }` 400/401/403/404/409/422/429/500; CORS `*`, no cookies), `idParam()` (non-UUID ids are 404), `serialize.ts` (worker-safe). Reads in `services/api-read.ts` (account-scoped, newest first, cursor = base64 of `created_at|id`, `public_url` on the custom domain when live). Writes in `src/server/api/writes.ts` through the existing services with the dashboard's side effects (public cache, follower sweep, post emails / scheduling). Routes `src/app/api/v1/**`: `account`, `workspaces[/id]`, `roadmaps[/id]` (with columns), `objectives`, `roadmap-cards[/id]` (GET/POST/PATCH/DELETE; PATCH can move to a column and complete), `feedback-boards`, `feedback-statuses`, `feedback[/id]` (GET/POST/PATCH/DELETE; complete/archive), `updates[/id]` (GET/POST/PATCH/DELETE; `status: published` publishes or schedules with `publish_at`, `draft` unpublishes), `articles[/id]` (read). Text fields are plain text in and out (`*_html` on single GETs).
- **OpenAPI** (`src/server/api/openapi.ts`, `/api/v1/openapi.json`): components from every Zod schema with `.meta({ id })` via `z.toJSONSchema(z.globalRegistry, { uri })`; query parameters from the list schemas; write bodies from `write-schemas.ts`. Settings → API → **API reference** page renders the same document.
- **Webhooks:** `emitEvent()` (`src/server/queue/webhooks.ts`) is called in the services right after the write (A11): `insertFeedback`, `updateFeedback` (+ `status_changed` when the status moved), complete/archive/review/bulk, `deleteFeedback`, `pushToRoadmap` and `linkCard` (`feedback.pushed_to_roadmap`), `insertCard`, `updateCard`, `moveCard`/`setCardCompleted` (+ `completed`), `deleteCard`, both vote toggles, `publishNow` (dashboard, API and scheduled publishes), `unpublishUpdate`, both comment adders, subscriber confirm/subscribe-verified/unsubscribe/remove. It enqueues an `emit` job (2 s delay, so the write has committed; ids only; off in unit tests). The worker's `webhooks` queue (concurrency 10) builds the payload once (`{ id: evt_…, event, created_at, account_id, data }`, `data` = the API shape; deleted items send `{ id, workspace_id }`), creates one delivery per enabled endpoint that wants the event, and delivers: `X-RadiusRoadmap-Signature: t=…,v1=…`, `X-RadiusRoadmap-Event`, `X-RadiusRoadmap-Delivery`, 10 s timeout, no redirects, 9 attempts with 3-minute exponential backoff (~25 h).
- **SSRF guard:** https only, no credentials in the URL, IP literals and every resolved address checked against private/loopback/link-local/metadata/CGNAT/multicast/reserved ranges (v4, v6, v4-mapped, NAT64); the HTTP request's own DNS lookup goes through the same check (no rebinding) and **pooled sockets are disabled** (`agent: false`; a reused keep-alive socket would skip the check — found by the tests). In development (`NODE_ENV=development`) private addresses are allowed so a local receiver works.
- **Failures (A10):** endpoint `failing_since` set on the first failure, cleared on success; only failures for 3 days → switched off with a reason + `webhook-disabled` email to owners. Delivery log keeps the newest 100 per endpoint. Settings → **Webhooks**: add/edit (URL, description, events grouped by resource), on/off switch, signing secret (reveal / rotate), Send test event (`ping`), recent deliveries with Resend.
- **Not done:** articles/comments/votes/subscribers writes, comment `updated/deleted` and the other LoopedIn events, OAuth apps, Zapier listing (§5).
- **Tests:** `api-keys.test.ts` (5), `api.test.ts` (10: auth, plan gate, read-only, tenant isolation on reads and writes, pagination, 400/404/422, card/feedback/update writes, OpenAPI refs resolve), `webhooks.test.ts` (9: address ranges, URL guard, real local HTTP server allowed in dev / refused in production by name and literal, endpoints roles/tenant/plan/private URL, routing to subscribed endpoints only, API-shaped payload, signature, retry → success → 3-day disable → skip while off → re-enable, last attempt fails). e2e `e2e/api.spec.ts` (create key → 401/200 → POST feedback → shows on the dashboard → signed webhook received by a local server → delivery log → revoke → 401). 280 unit, 32 e2e (+1 skipped).

