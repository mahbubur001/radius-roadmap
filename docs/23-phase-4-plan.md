# 23 — Phase 4 plan: Updates (changelog), subscribers and emails

Status: **APPROVED 2026-10-29** (U1–U7 as recommended in §2). **Built 2026-10-29** (steps 1–7, see "As built").

Phase 4 adds LoopedIn's **Updates**: posts announcing what shipped, a public changelog, subscribers who get each post by email, and the follow emails deferred from Phase 3 (doc 20 D3: "status changed" and "shipped" for people following an idea).

Sources:
- doc 05 (posts, categories, distribution, engagement, webhook names), doc 11 (plan limits, for Phase 6)
- doc 15 §4 + §9 #5 (public Updates tab; default categories: New feature, Improvement, Fix, Maintenance, Announcement, Coming soon)
- doc 16 §4 (admin Updates: subscribers count, New Post, search, View subscribers, Show recently completed, linking **completed cards** to a post) and §6 (admin email on new subscribers)
- doc 22 §2.4 (public Updates layout: search + **Categories ▾** filter) and §1 (Updates get their **own** `update_categories`, labelled "Category")
- doc 20 D3 (follow emails ship with Phase 4)

---

## 1. Scope

### In Phase 4
| Area | What ships |
|------|------------|
| Categories | Per-workspace **update categories** (name + colour, ordered), separate from roadmap objectives. New workspaces get the six defaults from doc 15 §9 #5 |
| Posts (admin) | `/dashboard/<workspace>/updates`: tabs **Published / Scheduled / Drafts**, search, category filter, stat tiles (subscribers, post views 30 days, reactions 7 days). Editor (page, autosave like the card drawer): title, category, body (`RichTextEditor` with images and video embeds), **cover image** (optional), public/private, **pinned**, **shipped cards** (pick completed roadmap cards), "Email subscribers when published" switch. Actions: Publish now, **Schedule**, Unpublish, Duplicate, Delete, View public post |
| From the roadmap | Card drawer rail **"Announce…"** on completed cards: opens a new draft post with the card's title, summary and the card linked (LoopedIn's "Show recently completed" + "completed Cards") |
| Public site | **Updates** tab at `/<account>/<workspace>/updates` (shown when the module is on and something is published): list with search + **Categories ▾** filter, pinned first, category chip, date, cover, excerpt, reactions; post page `/updates/<slug>` (drawer on click, full page on load, like cards and ideas) with the shipped cards linked to the roadmap; **Subscribe** box; **RSS** feed `/updates/feed.xml`; posts in the sitemap; 404/308 in the proxy |
| Subscribers | Public **Subscribe** (email; one click for logged-in voters). **Double opt-in** (U1): a confirmation email, then active. Every email has a one-click **unsubscribe** link and `List-Unsubscribe` headers. Admin: list (search, status), remove, **CSV export**, count on the Updates page and Home |
| Post emails | On publish (now or at the scheduled time) with the switch on: one email per active subscriber, sent by BullMQ in batches, idempotent per post + subscriber (U2) |
| Follow emails | (doc 20 D3) People following an idea get an email when its **status changes** and when it **ships** (a post links a card the idea is linked to). One-click unsubscribe per idea, and "stop all emails from this site" (U5) |
| Reactions | Emoji reactions on public posts: 👍 ❤️ 🎉 👀, one of each per visitor (anonymous visitor id or voter), counts on the post (U4) |
| Team alerts | Settings → Notifications gets **"New subscribers"** (instant / daily / off, default off) next to new ideas and comments |
| Home | Tiles: subscribers, post views, reactions |

### Not in Phase 4
- Segments / targeted posts (Enterprise in LoopedIn): later.
- Widget (sidebar / popover "latest update"): Phase 6.
- Per-account custom email templates, custom SMTP, hiding "Powered by": Phase 6 (white-label).
- Comments on posts: later (ideas and cards have them).
- Webhooks for `announcement.*` / `subscriber.*`: later; event names are kept so they can be added.

---

## 2. Decisions needed (my recommendation first)

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| U1 | Subscriber sign-up | **Double opt-in** (confirm by email) — protects SES reputation and is what GDPR expects; logged-in voters with a verified email skip it | Single opt-in (faster, more spam/bounces) |
| U2 | Emailing a post | **Per-post switch "Email subscribers when published", on by default**; editing a published post never re-sends | Always email / never email automatically |
| U3 | Scheduling | **Yes**: a delayed BullMQ job publishes at the chosen time (and sends the emails); rescheduling or unpublishing cancels it | No scheduling in Phase 4 |
| U4 | Reactions | **Yes, 4 fixed emojis**, one per visitor per emoji, no sign-in needed (same visitor id + rate limits as votes) | Leave reactions for later |
| U5 | Follow emails | **Status changed + shipped**, only when follows are on, one-click unsubscribe per idea and a site-wide "stop all emails" | Only "shipped" |
| U6 | RSS | **Yes**, `/updates/feed.xml` (public posts only) | No feed |
| U7 | Public path / module switch | **`/updates`**, plus an **Updates** switch in Public settings (like Roadmap and Ideas) | — |

---

## 3. Data model (migration `0007`)
- `update_categories`: id, account_id, workspace_id, name, color, position. Unique (workspace, name). Seeded with the six defaults; `0007` also seeds existing workspaces.
- `updates`: id, account_id, workspace_id, slug (unique per workspace), title, body_json, body_text, cover (storage key), category_id (set null), status `draft | scheduled | published`, publish_at, published_at, is_public, pinned, email_subscribers, emailed_at, created_by, created_at, updated_at, search (tsvector).
- `update_cards`: (update_id, card_id) — "shipped" cards.
- `update_reactions`: id, account_id, update_id, emoji (enum of the 4), visitor_id or tracked_user_id; unique per (update, emoji, voter).
- `update_subscribers`: id, account_id, workspace_id, email (lowercased), tracked_user_id (nullable), status `pending | active | unsubscribed`, token_hash (confirm / unsubscribe), confirmed_at, unsubscribed_at, source `public | voter | import`, created_at. Unique (workspace, email).
- `email_suppressions` (per account): email + reason (`unsubscribed_all`, `bounce`, `complaint`) — "stop all emails from this site" and, later, SES bounce/complaint webhooks.
- `notification_preferences.new_subscriber` (enum, default `off`).
- `workspaces.settings.showUpdates` (missing = on).
- `events`: new types `update_view`, `reaction`, `subscribe`.

## 4. Server code
- Services: `update-categories.ts`, `updates.ts` (CRUD, publish/schedule/unpublish, shipped cards, list with filters/search), `public-updates.ts` (list, post, RSS items, path status, sitemap), `subscribers.ts` (subscribe, confirm, unsubscribe, list, export), `reactions.ts`. Every query scoped by account + workspace; public ones by the account from the URL.
- Public API: `POST /api/public/subscribe`, `GET /api/public/subscribe/confirm?token=`, `GET|POST /api/public/unsubscribe?token=` (one-click, RFC 8058), `POST /api/public/reactions`. Turnstile + rate limits like votes.
- Jobs (queue `notify`): `publish-update` (delayed; publishes and fans out), `send-update-emails` (batches of subscribers → email queue, job id per post + subscriber), `idea-status-changed`, `idea-shipped`, `new-subscriber`. Email queue gets a rate limiter (SES sending rate).
- Templates: `subscribe-confirm`, `update-published`, `idea-status-changed`, `idea-shipped`, `new-subscriber`; all with unsubscribe link + headers.
- Cache: public update pages use `"use cache"` loaders tagged per workspace; publish/edit/unpublish call `invalidatePublic`.

## 5. UI
- **Dashboard → Updates:** tabs, search, category filter, tiles, "New post", "Subscribers", "Categories"; editor page `/dashboard/<workspace>/updates/<id>` with a right rail (status, schedule, category, pinned, public, email switch, shipped cards, cover) like the card drawer.
- **Roadmap card drawer:** "Announce…" on completed cards.
- **Public settings:** Updates switch.
- **Public site:** Updates tab (doc 22 §2.4 layout), post page, Subscribe box, RSS link, reactions.
- **Settings → Notifications:** "New subscribers".

## 6. Tests
- Vitest: isolation for every new table; only published public posts appear publicly (drafts, scheduled, private never); scheduling publishes once; editing a published post never re-emails; double opt-in states; unsubscribe and suppression stop every email type; follow emails only when follows are on and never to unsubscribed people; reactions dedupe.
- Playwright: write → schedule/publish → public list + post + RSS; subscribe → confirm (mail) → publish with email → subscriber gets it → unsubscribe link works; follow an idea → status change email; "Announce…" from a completed card.

## 7. Build order (each step leaves lint, typecheck, test, e2e and build green; one commit each)
1. Schema + migration `0007` + default categories + isolation tests.
2. Admin: categories editor, Updates list, editor with autosave, shipped cards, cover, "Announce…" from cards.
3. Publish / schedule / unpublish (delayed job) + public Updates tab, post page, RSS, sitemap, proxy statuses, Updates switch.
4. Subscribers: public subscribe + double opt-in + unsubscribe + suppressions; admin list + CSV; "New subscribers" alert.
5. Post emails on publish (batched, idempotent, rate-limited).
6. Follow emails (status changed, shipped) with unsubscribe.
7. Reactions + Home tiles; docs and PROGRESS.

## Done when
- [x] A post can be drafted, scheduled, published, unpublished; only published public posts are public.
- [x] Subscribers confirm, receive post emails once, and can unsubscribe in one click.
- [x] Idea followers get status-changed and shipped emails (when follows are on).
- [x] Public Updates tab, post pages, RSS and sitemap work; checks green.

---

## As built

- **Step 1 (2026-10-29):** schema in `src/server/db/schema/updates.ts`, migration `0007_updates` (tables, enums, `event_type` values, `notification_preferences.new_subscriber`, default categories backfilled for existing workspaces). `src/server/services/update-categories.ts` (seeded by `seedWorkspace`, admin-only CRUD).
- **Step 2 (2026-10-29):** `src/server/services/updates.ts` (drafts, autosave patch, shipped cards, duplicate, delete, list per tab with search + category, counts, card picker). Dashboard `/dashboard/<workspace>/updates` (tabs Published / Scheduled / Drafts, search, category filter, Categories dialog for admins, New post) and the editor `/dashboard/<workspace>/updates/<id>` (title, body, settings rail: category, cover, visibility, pinned, email switch, shipped cards, duplicate, delete; autosave). Covers reuse the description-image upload (`card-image` purpose, tenant prefix checked). Everyone with access can write posts. Card drawer: **Announce…** on completed cards starts a draft with the card's title, summary and link. E2E: `e2e/updates.spec.ts`.
- Also on 2026-10-29: dashboard content is capped at **1500px** and centered (owner request); drawer tabs show one underline; team members can vote on a card from its drawer (as their own voter record).
- **Step 3 (2026-10-29):** publish now / schedule / unpublish (`publishUpdate`, `unpublishUpdate` in `updates.ts`; worker-safe `publishNow` / `publishDue` in `update-publish.ts`). Scheduling queues a delayed `publish-update` job on the `notify` queue (job id includes the time, so rescheduling leaves the old job with nothing to do). The worker can't clear Next's cache, so after publishing it calls **`POST /api/internal/revalidate`**, signed with an HMAC of the auth secret (`internal-signature.ts`, 5-minute window); public Updates loaders also use a short cache life as a backstop. Public: Updates tab (order Roadmap · Updates · Ideas), `/updates` (search + Categories, pinned first), `/updates/<slug>` (drawer + page, shipped cards linked), `/updates/feed.xml` (RSS 2.0), sitemap, proxy 404s, Updates switch in Public settings. Editor rail: Publish now, Schedule… (date picker + half-hour slots, local time), Reschedule / Unschedule, Unpublish, View public post. Verified end to end: a post scheduled 45 s ahead went live at the due time and the cached list refreshed.
- **Worker guard:** the worker crashed when it imported `updates.ts` (→ storage → `server-only`); Vitest aliases `server-only`, so unit tests couldn't see it. `src/test/worker-imports.test.ts` now walks `worker.ts`'s real import graph and fails if it reaches `server-only` (with a sanity check that it does detect one).
- **Step 4 (2026-10-29):** `src/server/services/subscribers.ts` (subscribe with double opt-in; verified voters active at once; one random token per subscriber, only its SHA-256 stored; confirm; unsubscribe with optional "stop every email from this site" = `email_suppressions` `unsubscribed_all`; re-subscribing lifts that, never a bounce/complaint; admin list/counts/remove/CSV). Public: "Get updates by email" box on the Updates page, `POST /api/public/subscribe` (Turnstile, 10/hour per IP, 3/hour per address, same answer whether or not already subscribed), `GET /api/public/subscribe/confirm` (redirects to `/updates?subscribed=1`), `/api/public/unsubscribe` — **GET only shows a page with a button** (mail scanners open links), POST unsubscribes, also accepting the RFC 8058 one-click POST. Dashboard: Updates → Subscribers (tiles, search, status filter, remove, Export CSV). "New subscribers" alert (instant / daily in the digest / off, default off) via the `notify` queue.
- **Step 5 (2026-10-29):** post emails. On publish (immediately, or by the worker after a scheduled post goes live) a `send-update` job on the `notify` queue claims the post once (`emailed_at`, only published + public + "email subscribers" on), pages through active, unsuppressed subscribers (500 per batch, keyset by id) and queues one `update-published` email per subscriber (job id post + subscriber). Each email carries a **signed, non-expiring unsubscribe link** (`s` + `sig`, HMAC of the subscriber id; tokens are stored hashed so they can't be reused) and `List-Unsubscribe` + `List-Unsubscribe-Post` headers (SES v2 `Simple.Headers`, SMTP headers). The email worker is rate-limited to 12/s (under SES's default 14/s). `fileUrl` moved to the worker-safe `src/server/storage/url.ts`.
- **Step 6 (2026-10-29):** follow emails. Migration `0008`: `feedback_items.notified_status_id` (backfilled to the current status). Feedback and roadmap actions queue a debounced per-workspace **status sweep** (job id per workspace per minute, 60 s delay); the sweep (`follow-emails.ts`, worker-safe) emails followers of ideas whose status differs from `notified_status_id`, then records it — no false positives, and a change + change-back inside the minute sends nothing. Publishing a public post queues `idea-shipped`: followers of ideas linked to its cards get "Shipped: …". Both only when follows are on, only to **verified** addresses (guest emails are typed unchecked), never to suppressed ones; email job ids are per idea/status/follower. Signed "stop following" link (`/api/public/unfollow`, GET page + POST + one-click, optional "stop every email").
- **Step 7 (2026-10-29):** emoji reactions (👍 ❤️ 🎉 👀, `src/lib/reactions.ts`, `reactions.ts` service, `POST /api/public/reactions` with 60/hour per IP, no sign-in; counts in the cached post data, the visitor's own in `/api/public/me`). Post page views are tracked as `update_view`. Home gets three tiles: update subscribers (running total), update views and reactions (per period).
- Checks at the end of Phase 4: 182 unit, 25 e2e, lint, typecheck, build.
