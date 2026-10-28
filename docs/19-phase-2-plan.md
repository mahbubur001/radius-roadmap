# 19 — Phase 2 plan: Roadmap, voting, public roadmap page & embed

Status: **APPROVED 2026-10-27** (all recommendations in §2: D1 account subdomain, D2 anonymous + guest + magic link, D3 visitor cookie + rate limits + Turnstile, D4 LoopedIn import in Phase 2, D5 several roadmaps, D6 Home analytics v1). Building.

Phase 2 is the phase that lets Radius **replace LoopedIn**. Doc 15 §3 showed what Radius actually uses:
- a public, voteable roadmap
- 66 cards in 4 columns
- mostly anonymous votes (44 of 46 on one card)
- an iframe on radiustheme.com

Comments, ideas, the changelog and the KB are unused. This phase builds:
1. **Admin roadmap:** a kanban board with drag and drop, a card drawer with autosave, roadmap settings, categories and tags.
2. **Voting:** anonymous (deduplicated) plus signed-in voters, with abuse limits.
3. **Public roadmap site:** server-rendered and indexable, with card pages, search, and dark mode.
4. **Embed:** an auto-resizing iframe script.
5. **LoopedIn roadmap import** from CSV, so Radius's 66 cards and their vote counts come across.
6. A first **Home dashboard**: views, recent votes, top cards.

Sources:
- doc 04 (roadmaps), doc 07 (public pages / embeds), doc 08 (end-user auth)
- doc 15 §3, §8, §9 (public audit + approved changes)
- doc 16 §3, §7, §8 (admin audit + approved changes)
- doc 18 §3.5 (`tracked_users`, built in Phase 1)

---

## 1. Scope

### In Phase 2
| Area | What ships |
|------|------------|
| Roadmaps | Several roadmaps per workspace (plan-limited later), with a switcher. Settings: internal and public title/summary, public on/off, columns editor (rename, reorder, per-column public toggle, add, delete), display toggles (votes, categories, tags, dates, completed cards, descriptions) |
| Board (admin) | Kanban with **dnd-kit**: drag cards between and within columns, drag to reorder columns. "+" quick-add per column. Search, filters (category, tag, public/private) and a "Show completed" toggle |
| Card drawer | `?card=<id>`, **autosave** with a "Saved" indicator. Fields: internal title + optional public title, summary (Tiptap), category, tags, planned-for date, public toggle. **Features** checklist (title + done → progress bar). **Votes** tab (named voters + anonymous count). Actions: mark complete, archive, delete, copy public link |
| Categories & tags | Per workspace, with colors, managed from the board. Defaults on a new workspace: Onboarding, Increase Engagement, Revenue Growth, User Experience (LoopedIn's) |
| Voting | One vote per voter per card; unvote by clicking again. Anonymous votes are deduplicated by a signed visitor cookie and limited per IP. The workspace setting "Require sign-in to vote" (from Phase 1) is enforced. Vote counts are cached on the card |
| Voter sign-in | **Guest** (name + email, unverified) and **magic link** (6-digit code or link by email, verified) on the public site, using `tracked_users` and voter sessions from Phase 1. A visitor's anonymous votes move to their profile when they sign in |
| Public site | Server-rendered (SEO), at the URL scheme decided in D1. Roadmap page with columns, counts, cards, search and a completed toggle. Card page `/…/roadmap/<card-slug>`: a full page on a direct visit, a drawer when clicked from the board. Metadata, Open Graph, `sitemap.xml`, `robots.txt` (honours "index public pages"). Dark-mode default; "Powered by Radius Roadmap" footer |
| Embed | `embed.js` (tiny, no framework): `<script src="…/embed.js" data-site="…" async></script>` inserts an iframe of the public roadmap in embed mode (no site header) and **resizes it to its content**. Copy-paste code on a new "Public settings → Embed" page |
| Import | **LoopedIn roadmap CSV import**: columns, cards (title, description, category, tags, public flag, completed), and vote totals kept as `imported_votes`. A preview step before anything is written. Feedback/ideas import stays in Phase 3 |
| Analytics v1 | `events` table (page view, card view, vote, unvote) with coarse location from proxy headers (Cloudflare `cf-ipcountry`/`cf-ipcity` when present). Home dashboard: views (7D / 1M / 3M), recent votes feed, most-voted cards |
| Rich text | Tiptap editor (bold, italic, underline, headings, lists, link, image upload via Phase 1 storage, code). Stored as JSON and rendered to sanitized HTML on the server |

### Not in Phase 2
- Comments and follows: Phase 3, optional per workspace and off by default (doc 16 §8 #10). Radius has 1 comment in total.
- Linked feedback, "push to roadmap" and the 💡 link: Phase 3, together with feedback boards.
- "Card completed → create an update post" and emailing voters: Phase 4.
- Google sign-in and customer SSO (JWT) for voters, plus the sidebar widget: Phase 6 / Later.
- Custom domains, white-label colours and fonts: Phase 6. The public site already reads theme colours from CSS variables, so this is just configuration later.
- Attachments on cards (other than images in the description), Jira, webhooks and the public API: Later.

---

## 2. Decisions needed (my recommendation first)

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| D1 | Public site URL | **Account subdomain:** `https://<account-slug>.<PUBLIC_ROOT_DOMAIN>/<workspace-slug>` (roadmap at `/<workspace>/roadmap`, card at `/<workspace>/roadmap/<card-slug>`). An account with one workspace redirects `/` → that workspace. Locally: `http://acme.localhost:3000`. Why: customer content is served from a **separate origin** from the dashboard, so it can never read dashboard cookies; voter cookies stay per account; and custom domains (Phase 6) plug into the same host-based routing already in `src/proxy.ts` | Path on the app domain: `app.example.com/p/<account>/<workspace>` (simpler DNS/TLS, but public pages share the dashboard's origin) |
| D2 | Voter sign-in now | **Anonymous + guest + magic link.** Google and customer SSO later | Also Google now (needs an OAuth redirect via the app domain for every subdomain) |
| D3 | Anonymous vote abuse | **Signed visitor cookie + IP-hash rate limits + invisible Cloudflare Turnstile** on anonymous and guest votes (no puzzle for normal visitors; test keys locally). Signed-in voters skip Turnstile | Rate limits only, no Turnstile |
| D4 | LoopedIn import timing | **Roadmap import in Phase 2**, so Radius can switch over at the end of this phase. **Needs from you:** a LoopedIn roadmap export file (LoopedIn → Roadmap → More → Export). I'll build the importer against the real file | Keep all imports in Phase 3 |
| D5 | Several roadmaps per workspace | **Yes, in the data model and a simple switcher**. Roadmap limits per plan come in Phase 6 | One roadmap per workspace |
| D6 | Home dashboard | **Analytics v1 in Phase 2** (views, recent votes, top cards) | Leave Home as a placeholder until later |

Not blocking: the production root domain (for example `radiusroadmap.com`) goes in an env var, so it can be decided at deploy time.

---

## 3. Data model

All tables have `account_id` + `workspace_id` and are scoped by them (CLAUDE.md). Ordering uses **fractional index** strings (`fractional-indexing` package), so a drag updates one row instead of renumbering a column.

### 3.1 `roadmaps`
`id`, `account_id`, `workspace_id`, `slug` (unique per workspace), `internal_title`, `public_title` (nullable → falls back to internal), `internal_summary`, `public_summary`, `is_public` (default true), `position`, `display` jsonb, `created_at`, `updated_at`.

`display` holds the public toggles: `showVotes`, `showCategories`, `showTags`, `showDates`, `showDescriptions`, `showCompleted`, `showFeatures`. All default to on, except `showDates`.

### 3.2 `roadmap_columns`
`id`, `account_id`, `workspace_id`, `roadmap_id` (cascade), `name`, `position`, `is_public` (default true), `is_done` (cards here count as completed; used for "Show completed"), `created_at`.

Defaults for a new roadmap: In progress, Up next, Future, Done (`is_done`), matching Radius's LoopedIn board.

### 3.3 `roadmap_cards`
| Column | Notes |
|--------|-------|
| `id`, `account_id`, `workspace_id`, `roadmap_id`, `column_id` | `column_id` is restricted (on delete): a column that still has cards can't be deleted; move them first |
| `slug` | unique per roadmap, from the public title, kept stable after creation |
| `title`, `public_title` (nullable) | internal vs public (doc 16 §8 #5) |
| `summary_json` (jsonb), `summary_text` | Tiptap JSON + plain text (for previews and search) |
| `category_id` (nullable) → `categories` | |
| `planned_for` (date, nullable) | |
| `is_public` (default true) | |
| `completed_at`, `archived_at` | timestamps instead of flags |
| `position` | fractional index within the column |
| `vote_count` | cached count of real votes (updated in the same transaction as the vote) |
| `imported_votes` (default 0) | vote totals from LoopedIn; the public total = `vote_count + imported_votes` |
| `search` | generated `tsvector` over the public title + summary text, GIN index (Postgres full-text search, CLAUDE.md) |
| `created_by`, `created_at`, `updated_at` | |

### 3.4 `card_features`
`id`, `account_id`, `card_id` (cascade), `title`, `done`, `position`. Progress = done / total.

### 3.5 `categories` and `tags`
- `categories`: `id`, `account_id`, `workspace_id`, `name`, `color`, `position`, unique `(workspace_id, name)`. Shared with feedback in Phase 3.
- `tags`: `id`, `account_id`, `workspace_id`, `name`, unique `(workspace_id, name)`.
- `card_tags`: `card_id`, `tag_id`.

### 3.6 `votes`
| Column | Notes |
|--------|-------|
| `id`, `account_id`, `workspace_id`, `card_id` (cascade) | |
| `tracked_user_id` (nullable) → `tracked_users` | signed-in or guest voter |
| `visitor_id` (nullable) | random id from the signed visitor cookie (anonymous votes) |
| `ip_hash` | HMAC-SHA256 of the IP with a server secret; the raw IP is never stored |
| `country`, `city` (nullable) | coarse location for the activity feed |
| `source` | `public` \| `embed` \| `admin` |
| `created_at` | |

- Unique `(card_id, tracked_user_id)` where `tracked_user_id` is not null.
- Unique `(card_id, visitor_id)` where `tracked_user_id` is null.
- **On sign-in**, that visitor's anonymous votes move to the voter; duplicates are dropped.

### 3.7 `events` (analytics v1)
`id` (bigserial), `account_id`, `workspace_id`, `type` (`page_view` \| `card_view` \| `vote` \| `unvote`), `subject_id` (nullable), `visitor_id`, `country`, `city`, `source` (`public` \| `embed`), `created_at`, with an index on `(workspace_id, created_at)`. Charts query it directly for now; daily rollups come when volume needs them.

### 3.8 `voter_login_codes` (magic link)
`id`, `account_id`, `email`, `code_hash`, `expires_at` (15 min), `attempts`, `consumed_at`. The email contains both a 6-digit code and a link carrying a one-time token. Five wrong attempts burn the code.

---

## 4. Server code

### 4.1 Services (all scoped by account + workspace; public ones take a `PublicContext`)
| Service | Functions |
|---------|-----------|
| `roadmaps` | list/get/create/update/delete roadmap (admin+ for settings; members with workspace access can edit cards), default columns on create; columns: create/rename/move/toggle public/delete-if-empty |
| `cards` | create (quick add), update (autosave patch), move (column + position), complete/reopen, archive/restore, delete; features CRUD; tags set; list for the board with filters and search |
| `categories` / `tags` | CRUD + defaults on workspace creation (hooked into `createWorkspace`) |
| `votes` | `castVote` / `removeVote` (transaction + cached count), `listVoters(card)` (admin: named voters + anonymous count), `claimVisitorVotes(visitorId, trackedUserId)` |
| `public-site` | `resolveSite(host)` → account + workspace list (only `is_public` content); `getPublicRoadmap`, `getPublicCard`, `searchPublicCards`: **only public roadmaps, public columns, public, unarchived cards**, and only the fields allowed by `display` |
| `voter-auth` | `startMagicLink(email)`, `verifyCode`, `verifyLinkToken`, `guestIdentify(name, email)`. Builds on `identifyTrackedUser` and the voter session service from Phase 1 |
| `events` | `track(event)` (insert, never blocks the response), dashboard queries |
| `importers/loopedin` | parse CSV (`papaparse`) → preview → import in one transaction; idempotent by the LoopedIn card id stored in `external_ref` |

Who can do what with cards: everyone with workspace access (Phase 1 rules) can create, edit and move cards. Roadmap settings, columns, categories and the import need admin+.

### 4.2 Public site routing (D1)
- `src/proxy.ts`:
  - app host → dashboard, as today
  - `<slug>.<PUBLIC_ROOT_DOMAIN>` and (Phase 6) custom domains → rewrite to `/sites/<host>/…`
  - sets the signed `rr_vid` visitor cookie when it's missing
- Public route tree under `src/app/(public)/sites/[host]/`:
  - `[workspace]/page.tsx` → the default roadmap
  - `[workspace]/roadmap/[[...slug]]`
  - an intercepting route (`(.)`) so a card opens as a drawer on soft navigation and as a full page on direct load
- Public pages are cached with Cache Components (`"use cache"` + `cacheTag("ws:<id>")`). Admin edits and votes call `revalidateTag`. The voter's own "voted" state is read separately inside `<Suspense>`, so the page stays cacheable.
- New env: `PUBLIC_ROOT_DOMAIN` (dev `localhost:3000`), `TURNSTILE_SITE_KEY`/`TURNSTILE_SECRET_KEY` (Cloudflare test keys in `.env.example`), `VISITOR_SECRET` (signs `rr_vid` and hashes IPs).
- `deploy/Caddyfile`: `*.<root>` uses on-demand TLS. `/api/internal/domain-check` approves `<slug>.<root>` when that account exists (custom domains are still refused until Phase 6).
- Security headers: the dashboard sends `frame-ancestors 'none'`. Public pages may be framed (embed). User HTML is rendered only from Tiptap JSON through an allow-listed renderer, and links get `rel="nofollow ugc noopener"`.

### 4.3 Voting endpoint
`POST /api/public/votes` (a route handler, so it works from the embed iframe and later the widget). Steps:
1. resolve the site from the host
2. check the card is public and votable
3. pick the voter (voter session → tracked user; else `rr_vid`)
4. if the workspace requires sign-in → 401 with "sign in to vote"
5. check Turnstile for anonymous and guest votes (D3)
6. rate limits in Redis (`src/server/rate-limit.ts`, fixed window): per IP hash, 30 votes/hour and at most 3 anonymous votes per card per IP per day
7. toggle the vote
8. track the event
9. revalidate the tag
10. return the new count

### 4.4 Cookies in the embed
The embed iframe is third-party on the customer's site, so its cookies are set `SameSite=None; Secure; Partitioned` (CHIPS) when `?embed=1`.
- Browsers that block them still allow **anonymous voting**, because the visitor id falls back to a token kept in the iframe's `localStorage` and sent in a header.
- Signing in inside a blocked iframe opens the public site in a new tab.

---

## 5. UI

### Dashboard
- **Roadmap page** (`/<workspace>/roadmap`):
  - Toolbar: roadmap switcher, search, filters, "Show completed", "Edit roadmap", "Categories", "Import", "View public ↗".
  - The board scrolls horizontally on small screens.
- **Card drawer** (Sheet, `?card=<id>`):
  - Tabs: General | Features | Votes.
  - Autosave (debounced 600 ms, server action) with "Saving…/Saved".
  - Optimistic drag and drop: a failed move snaps back with a toast.
- **Edit roadmap** dialog: titles and summaries (internal/public), public switch + public URL, the columns editor, display toggles.
- **Public settings → Embed**: copy-paste snippet, a live preview, and the public URL.
- **Home**: views chart (7D/1M/3M), recent votes ("Someone from Dhaka, BD voted *Bidding & Auction* · 2h ago"), most-voted cards.

### Public site
- Header: logo + workspace name, tabs (only "Roadmap" for now; later phases add theirs), sign-in button.
- **Roadmap:**
  - columns with counts
  - cards with a category colour bar and label, title, description preview, vote button with total, features progress (if shown)
  - search box
  - "Show completed" toggle
- **Card page/drawer:** title, rendered summary, category, tags, planned date, features with progress, vote button.
- **Sign-in dialog:** email → code (magic link); or "Continue as guest" (name + email) if allowed. Signed-in state is shown with a sign-out link.
- Embed mode (`?embed=1`): no header or footer chrome; reports its height to the parent.
- Accessible: keyboard-operable vote buttons with `aria-pressed`, visible focus, labelled dialogs.

---

## 6. Tests

### Vitest (services, test DB)
- **Isolation:** no roadmap, column, card, category, tag, vote or event from account A can be read or changed with account B's context; public queries for host A never return B's content.
- **Visibility:** private roadmaps, private columns, private/archived cards and hidden display fields never appear in `public-site` results or search.
- **Votes:**
  - one per voter per card; toggle; cached count stays equal to the rows
  - a visitor's votes are claimed on sign-in without duplicates
  - "require sign-in" is enforced
  - rate limits trip (Redis)
- **Ordering:** moves keep a stable order across many drags (fractional index).
- **Magic link:** expired, wrong (5 attempts) and reused codes are rejected; the code is stored only as a hash.
- **Import:** a fixture CSV builds the expected columns, cards and vote totals; importing the same file twice doesn't duplicate.

### Playwright
1. An admin creates a roadmap, adds cards, drags a card to another column, sets a category, and the autosave persists after reload.
2. The public site (`<account>.localhost:3000`) shows only public columns and cards; card links work as a drawer and as a full page; search finds a card.
3. An anonymous visitor votes (count +1), votes again (unvote), and a fresh browser context counts as a new visitor.
4. With "require sign-in" on: the vote asks for sign-in → magic link code from `.dev-mail` → vote counts and is shown under the voter's name in the admin Votes tab.
5. The embed test page loads `embed.js`, the iframe grows to the content height, and a vote works inside it.
6. Import a sample LoopedIn CSV and see the cards and totals on the board.

---

## 7. Build order (each step leaves `check`, `typecheck` and `test` green)
1. Schema (§3) + migration; categories and tags defaults on workspace create; `fractional-indexing`.
2. Roadmap, column and card services + tests.
3. Admin board (dnd-kit) + roadmap settings dialog + categories/tags.
4. Card drawer with Tiptap + autosave + features.
5. Public site routing (proxy, `resolveSite`, domain-check, env) + public roadmap and card pages + SEO files.
6. Voting endpoint, visitor cookie, rate limits, Turnstile + public vote UI + admin Votes tab.
7. Voter sign-in (guest + magic link) + claiming visitor votes.
8. Embed (`embed.js` + embed mode + Public settings → Embed page).
9. Events + Home dashboard v1.
10. LoopedIn roadmap import (once the owner's export file is in `docs/samples/` or attached).
11. Playwright flows; update CLAUDE.md, doc 14 (new deps: `@dnd-kit/*`, `@tiptap/*`, `fractional-indexing`, `papaparse`; new env vars) and PROGRESS.md.

## D1 revised: public pages on the app domain (owner decision, 2026-10-28)
The owner replaced D1 (account subdomains) with LoopedIn-style paths on the app domain (`app.loopedin.io/classified-listing`). Subdomains are removed.

| Before | After |
|--------|-------|
| `https://<account>.<PUBLIC_ROOT_DOMAIN>/<workspace>/roadmap` | `https://<app>/<account>/<workspace>/roadmap` |
| card `…/<workspace>/roadmap/<card>` | `/<account>/<workspace>/roadmap/<card>` |
| dashboard `/<workspace>/…` | `/dashboard/<workspace>/…` (onboarding, auth pages and `/` stay where they are) |
| `<account>.<root>/sitemap.xml`, `/robots.txt` | `/<account>/sitemap.xml`; one app-wide `/robots.txt` (disallows `/dashboard`, `/api` and the auth pages) |

How it works:
- **Routing:** `src/proxy.ts` branches on the path, not the host. `/dashboard/…` and the app's own routes go to the dashboard (no framing allowed). Any other first segment is an account slug: the proxy checks it with `publicPathStatus` (real 404 / 308), issues `rr_vid`, and rewrites to `/sites/<account>/…` internally. Direct requests to `/sites/…` get a 404.
- **Reserved slugs:** account slugs can't be an app route (`dashboard`, `sign-in`, `api`, `sites`, … in `RESERVED_SLUGS`).
- **Public API:** `/api/public/*` stays. The account comes from the `x-rr-site` header (the public pages and the embed send their account slug; the magic link carries `site=`). It is a routing hint exactly like the old Host header: sessions, cards and workspaces are still checked against that account.
- **Cookies:** `rr_vid` (anonymous visitor) is one cookie for the app domain. The voter session is per account: `rr_vs_<accountId>`, so signing in on one account's site never signs you in on another's.
- **Framing:** only public paths may be framed; the dashboard keeps `frame-ancestors 'none'`.
- **Embed:** `<script src="https://<app>/embed.js" data-account="<account>" data-workspace="<workspace>" async>`.
- **Removed:** `PUBLIC_ROOT_DOMAIN`, the wildcard block and on-demand TLS in `deploy/Caddyfile`, and `/api/internal/domain-check` (custom domains in Phase 6 bring host-based routing back for those domains only).
- **Trade-off (accepted):** public pages now share the dashboard's origin, which the subdomain design avoided. Mitigations: user content is only rendered through the allow-listed Tiptap renderer, the dashboard session cookie is `httpOnly`, and server actions check the Origin. A strict CSP on public pages is a follow-up.

## As built (2026-10-27, steps 1–9)
Deviations from the plan above:
- **Card slugs are unique per workspace**, not per roadmap. Card pages live at `/<workspace>/roadmap/<card-slug>`; a non-default roadmap is chosen with `?board=<roadmap-slug>`.
- **The public card drawer is client-side** (a real link opened in a Sheet with `history.pushState`) instead of an intercepting route. The full card page stays server-rendered and crawlable.
- `roadmap_cards.column_id` uses `ON DELETE NO ACTION` so deleting a roadmap cascades; a column that still has cards can't be deleted (ConflictError).
- New workspaces are seeded with one roadmap ("Roadmap"), four columns (In progress, Up next, Future, Done) and four categories. Workspaces created before Phase 2 have no categories until an admin adds them.
- Server actions under `[workspace]` use the new `workspaceAction(schema, (ctx, input) => …)` wrapper in `src/server/action.ts`.
- Public data is cached with `"use cache"`: per workspace (`ws:<id>`, dropped by `invalidatePublic`) and per account (`site:<id>`, dropped by `invalidateSite` when workspaces, the account or a roadmap's public state change).
- Shared form components were added for every rich value: `DatePicker` / `DateRangePicker`, `ColorPicker`, `RichTextEditor` (`src/components/form/`), plus `ColumnChart` (`src/components/charts/`).
- Home dashboard v1: 7D/1M/3M range (`?range=`), stat tiles (page views, unique visitors, votes), page views per day (with a table view), recent votes, most voted.

- Playwright flows 1–5 are in `e2e/roadmap.spec.ts` (flow 6 waits for the importer). Each test sends its own `x-forwarded-for` so vote rate limits don't collide between runs; the embed test serves the customer page from a local HTTP server, because Chrome blocks route-mocked (public) pages from loading loopback URLs.
- The embed measures the site shell (`[data-embed-root]`), not the document, so the iframe can also shrink below its 600px default.
- **Real 404s and redirects for public sites come from the proxy.** Public pages stream (Cache Components), so their status is fixed at 200 before they render. `src/proxy.ts` first runs `publicPathStatus` (one indexed query, same visibility rules as the loaders): missing site/workspace/roadmap/card → plain 404 page; `/` (one workspace) and `/<workspace>` → 308 to the roadmap. Approved by the owner 2026-10-28.

- Rate limits: `src/server/rate-limit.test.ts` checks that `hit()` trips (incl. the per-card anonymous limit). `clientIp()` / `clientLocation()` only trust Cloudflare's `cf-*` headers when `TRUST_CLOUDFLARE=1`; otherwise they use the first `x-forwarded-for` hop, which Caddy overwrites with the real peer address (2026-10-28).

Still to do: step 10 (LoopedIn import, waiting for the export file).

## Done when
- [x] Admins and members (with access) manage a roadmap on a drag-and-drop board; cards autosave; columns, categories, tags and display settings work.
- [x] The public roadmap at `<account>.<root>/<workspace>/roadmap` is server-rendered, indexable (when allowed) and shows only public content.
- [x] Anonymous, guest and magic-link voters can vote once per card, with abuse limits; "require sign-in" works; admins see named voters + the anonymous count.
- [x] `embed.js` embeds the roadmap with automatic height, and voting works inside it.
- [ ] Radius's LoopedIn roadmap export imports with its columns, cards and vote totals.
- [x] Home shows views, recent votes and top cards.
- [ ] `pnpm lint`, `typecheck`, `test`, `test:e2e` and `build` pass.
