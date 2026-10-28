# 20 — Phase 3 plan: Feedback boards, triage inbox, push to roadmap

Status: **APPROVED 2026-10-28** (all recommendations in §2: D1 shared `votes` table, D2 triage by default, D3 comments + follows now with emails in Phase 4, D4 Impact + Effort, D5 automatic card → feedback status sync, D6 guest or magic link to submit, D7 LoopedIn feedback import in Phase 3). Building.

Phase 3 adds the feedback side of LoopedIn. Customers submit ideas and vote on them; the team triages, prioritises and pushes them to the roadmap. The admin audit (doc 16 §2, §8) is the main source. Radius has **62 private feedback items** with status "New" that nobody reviewed, because LoopedIn hides new submissions and gives no inbox. So the core of this phase is the **triage inbox**, not just the board.

Sources:
- doc 03 (feedback and ideas), doc 07 (public pages), doc 10 (webhook event names, for later)
- doc 15 §9 #4, #5, #7 (Turnstile on submissions, the 💡 card ↔ idea link, migration)
- doc 16 §2 and §8 #1, #3, #7, #10, #13, #14 (approved: triage inbox, status ≠ category, CSV, comments optional, merge/move/copy, notification preferences)
- doc 19 (the Phase 2 model this builds on: categories, tags, votes, events, tracked users, public site)

Phase 2 step 10 (LoopedIn roadmap import) is still waiting for the export file. Phase 3 steps 1–8 don't depend on it; step 9 (feedback import) reuses its importer, so step 10 is built first once the files arrive.

---

## 1. Scope

### In Phase 3
| Area | What ships |
|------|------------|
| Boards | Several feedback boards per workspace (plan limits in Phase 6). Settings: name, slug, description, public on/off, **auto-publish** new submissions (default off → they go to triage), position. A new workspace gets one public board, "Feature requests" |
| Statuses | Per-workspace statuses with colours, **separate from categories** (doc 16 §8 #3). Each has a kind: `open`, `planned`, `in_progress`, `done`, `declined`. Defaults: New, Under review, Planned, In progress, Done, Declined. Managed from the board, like categories |
| Feedback list (admin) | `/dashboard/<workspace>/feedback`: board switcher, search, sort (most votes, newest, oldest, recently updated, priority), filters (status, category, tag, public/private, linked to a card or not, priority bucket, archived). Row: vote box, status chip, Private badge, title, summary preview, priority badge, comment count, updated time |
| Feedback drawer | `?feedback=<id>`, **autosave** like the card drawer. Tabs: General, Votes, Comments. Fields: title, summary (`RichTextEditor`), board, status, category, tags, public toggle, **Impact** and **Effort** (XS–XL → priority score, doc 03), submitted by, created, updated. Actions: Push to roadmap, Add to roadmap card, Merge, Move to board, Duplicate, Mark complete, Archive, Delete, View public, Copy link |
| Triage inbox | `/dashboard/<workspace>/feedback/inbox`: new submissions waiting for review, oldest first, with an **unread count in the sidebar**. One item at a time or bulk: **Approve** (publish), **Keep private**, **Reject** (archive), **Merge into…**, set status/category/tags. Keyboard shortcuts (j/k, a, r, m) |
| Push to roadmap | From a feedback item: **create a linked card** (pick roadmap and column; title and summary copied) or **link to an existing card**. Many feedback items can link to one card. The card drawer gets a **Linked feedback** tab (items with their vote counts). Public card shows 💡 with the number of linked requests |
| Status sync | When a linked card moves into a done column, its linked feedback moves to the workspace's first `done` status (D5) |
| Merge | Merge A into B: A's votes move to B (duplicates dropped, cached count updated), followers and comments move too, A is archived with `merged_into_id`. A's public URL redirects (308) to B |
| Voting | Same rules, endpoint, limits and Turnstile as card votes (doc 19 §4.3), on feedback items. The admin Votes tab lists named voters + an anonymous count |
| Public site | A **Feedback** tab at `/<account>/<workspace>/feedback` (board switcher when there's more than one public board), item page `/<account>/<workspace>/feedback/<item-slug>` (drawer on soft navigation, full page on direct load, like cards), search, sort (trending, top, new), status filter, **Submit idea** dialog. Only approved, public, unarchived items on public boards are shown. Sitemap includes them |
| Submissions | Title + description (plain text, max 5000 chars). The submitter must be a guest (name + email) or a magic-link voter (D6). Turnstile + rate limits. The submitter's own pending items show to them with a "Waiting for review" badge |
| Comments and follows | Optional per workspace, **off by default** (doc 16 §8 #10). Comments: plain text with auto-linked URLs; team replies are marked "Team"; team members can also leave **internal notes** that are never public; optional "approve comments first". Follows: a voter follows an item (voting and submitting follow automatically). Follow emails are sent from Phase 4 (D3) |
| Notifications | Team email on **new feedback** and **new comment**, per member: instant, daily digest or off (doc 16 §8 #14). Sent by BullMQ jobs. Defaults: owners and admins instant, members off |
| Import / export | **LoopedIn feedback CSV import** (the 62 items, with votes as `imported_votes`), through the Phase 2 importer page with a preview step, idempotent by `external_ref`. **CSV export** for feedback and roadmap cards |
| Embed | `embed.js` gets `data-page="feedback"` to embed the feedback board instead of the roadmap |
| Home dashboard | New tiles: feedback waiting for review, new feedback this period, top-voted feedback |

### Not in Phase 3
- Emails to followers and voters (status changed, shipped): Phase 4, with the update posts and subscribers.
- Attachments and video on feedback, emoji reactions: Later.
- Sentiment analysis and AI tagging or duplicate detection: Later (doc 14 lists AI tagging as a later job).
- Jira, webhooks, public API: Later. Event names follow doc 03 so webhooks can be added without renaming.
- Copy to another workspace (LoopedIn "Copy to…"): Later. Move between boards of the same workspace is in.
- Google sign-in and customer SSO for submitters: Phase 6 / Later, as in Phase 2.

---

## 2. Decisions needed (my recommendation first)

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| D1 | Where feedback votes live | **Extend `votes`** with a nullable `feedback_id` and a check that exactly one of `card_id` / `feedback_id` is set, plus partial unique indexes per target. One vote service, one rate limit, one `claimVisitorVotes`, one events feed, and merge is a plain `UPDATE` | A separate `feedback_votes` table (simpler constraints, but every vote path is duplicated) |
| D2 | New public submissions | **Go to the triage inbox, private until approved.** Per-board "auto-publish" switch for teams that want it. The inbox count and the email alert make sure they're seen (the 62-item backlog is the lesson) | Public by default, with moderation after the fact |
| D3 | Comments and follows | **Build both in Phase 3**, off by default per workspace, with optional comment approval. Follows are stored now; **follow emails ship in Phase 4** with the subscriber and email work | Leave comments and follows until after Phase 5 (Radius has 1 comment in total) |
| D4 | Prioritisation | **Impact + Effort (XS–XL) with LoopedIn's score and buckets** (doc 03: score 2–10; Quick wins 8–10, Maybe 5–7, Time sinks 2–4). Shown as a badge, sortable and filterable. A matrix view comes later | No prioritisation in Phase 3 |
| D5 | Card ↔ feedback status sync | **One way, automatic:** a linked card entering a done column sets its feedback to the first `done` status; reopening the card sets it back to the first `in_progress` status. Pushing to the roadmap sets the feedback to the first `planned` status. Manual changes on the feedback still win until the next card move | No sync; statuses are only set by hand |
| D6 | Who can submit | **Guest (name + email) or magic link**, so the team can always reply and Phase 4 can notify. Anonymous visitors can still vote. The existing "require sign-in" setting then requires magic link for submitting too | Allow anonymous submissions (LoopedIn allows them; more spam and no way to reply) |
| D7 | LoopedIn feedback import | **In Phase 3**, built against the real feedback export. **Needs from you:** LoopedIn → Boards → More → Export, saved to `docs/samples/` next to the roadmap export | Skip it and start the 62 items again by hand |

---

## 3. Data model

Same rules as Phase 2: every table has `account_id` and `workspace_id` and every query is scoped; ordering uses fractional indexes; one migration (`0003`).

### 3.1 `feedback_boards`
`id`, `account_id`, `workspace_id`, `slug` (unique per workspace), `name`, `description`, `is_public` (default true), `auto_publish` (default false), `position`, `created_at`, `updated_at`.

### 3.2 `feedback_statuses`
`id`, `account_id`, `workspace_id`, `name`, `color`, `kind` (enum `open` | `planned` | `in_progress` | `done` | `declined`), `position`, unique `(workspace_id, name)`. A status in use can't be deleted until its items are moved (same rule as columns).

### 3.3 `feedback_items`
| Column | Notes |
|--------|-------|
| `id`, `account_id`, `workspace_id`, `board_id` | `board_id` restricted on delete: move items before deleting a board |
| `slug` | unique per workspace, from the title, stable after creation |
| `title`, `summary_json` (jsonb), `summary_text` | plain-text submissions are stored as a Tiptap paragraph doc, so admin edits use the same editor |
| `status_id` → `feedback_statuses`, `category_id` (nullable) → `categories` | categories are shared with the roadmap (doc 19 §3.5) |
| `is_public` (default true) | |
| `review` | enum `pending` \| `approved` \| `rejected`. Public = `approved` and `is_public` and not archived. Admin-created items start `approved` |
| `impact`, `effort` | smallint 1–5, nullable (XS–XL). Priority score is computed in SQL, not stored |
| `vote_count`, `imported_votes` | as on cards |
| `comment_count` | cached, public comments only |
| `author_tracked_user_id` (nullable), `author_user_id` (nullable) | submitter: an end user or a team member |
| `source` | enum `public` \| `embed` \| `admin` \| `import` |
| `merged_into_id` (nullable, self-reference) | set by merge; the item is archived too |
| `completed_at`, `archived_at` | |
| `external_ref` (nullable) | LoopedIn id, unique per workspace when set (idempotent import) |
| `search` | generated `tsvector` over title + summary text, GIN index |
| `created_at`, `updated_at` | |

Indexes: `(workspace_id, board_id, review)`, `(workspace_id, review, created_at)` for the inbox.

### 3.4 Links, tags, votes
- `feedback_tags`: `feedback_id`, `tag_id` (reuses `tags`).
- `card_feedback_links`: `card_id`, `feedback_id`, `account_id`, `workspace_id`, `created_by`, `created_at`; primary key `(card_id, feedback_id)`. Both sides cascade.
- `votes` (D1): `card_id` becomes nullable, add `feedback_id` (cascade), check `num_nonnulls(card_id, feedback_id) = 1`, and two more partial unique indexes on `(feedback_id, tracked_user_id)` and `(feedback_id, visitor_id)`.
- `events`: new types `feedback_view`, `feedback_submit`, `comment`.

### 3.5 `comments`
`id`, `account_id`, `workspace_id`, `feedback_id` (cascade), `body` (plain text, max 5000), `author_tracked_user_id` or `author_user_id`, `is_internal` (team note, never public), `review` (`approved` | `pending`), `created_at`, `edited_at`, `deleted_at` (soft delete keeps the thread readable).

### 3.6 `follows`
`feedback_id`, `tracked_user_id`, `account_id`, `created_at`; primary key `(feedback_id, tracked_user_id)`. Phase 4 reads this to send emails.

### 3.7 `notification_preferences`
`account_id`, `user_id`, `workspace_id`, `new_feedback` and `new_comment` (enum `instant` | `daily` | `off`); primary key `(user_id, workspace_id)`. A missing row means the role default (§1 Notifications).

### 3.8 Workspace settings (jsonb, from Phase 1)
Add `commentsEnabled` (false), `followsEnabled` (false), `approveComments` (false).

---

## 4. Server code

### 4.1 Services
| Service | Functions |
|---------|-----------|
| `feedback-boards` | list/get/create/update/delete-if-empty, defaults on workspace creation (one board + statuses) |
| `feedback-statuses` | CRUD, reorder, `firstOfKind(kind)` for status sync |
| `feedback` | create (admin), update (autosave patch), list with filters/sort/search, review (`approve`, `keepPrivate`, `reject`, bulk), move board, duplicate, merge, complete/reopen, archive/restore, delete, inbox count |
| `feedback-links` | `pushToRoadmap(feedbackId, roadmapId, columnId)` (creates card + link in one transaction), `linkCard`, `unlinkCard`, `linkedFeedback(cardId)`; status sync is called from `cards.move` |
| `votes` | generalised to a `target` (`{ cardId }` or `{ feedbackId }`) |
| `comments` | list (public: approved, non-internal), create (public or team), approve, delete; keeps `comment_count` in the same transaction |
| `follows` | follow, unfollow, auto-follow on vote and submit (when follows are on) |
| `public-site` | `getPublicBoards`, `getPublicFeedback(board, sort, status, q)`, `getPublicFeedbackItem(slug)` (with 308 for merged items), `submitFeedback`; `publicPathStatus` learns the feedback routes |
| `notifications` | `notifyNewFeedback(id)`, `notifyNewComment(id)` enqueue jobs; a daily digest job |
| `importers/loopedin` | adds the feedback file (boards, items, statuses, categories, votes) |
| `exports` | CSV export of feedback and cards (streamed route handler, admin+) |

Permissions follow Phase 1 and 2: anyone with workspace access can triage, edit, link and comment; board and status settings, delete, import and export need admin+.

### 4.2 Public API routes (all start with `publicRequest`)
- `POST /api/public/feedback`: submit (Turnstile, `hit()` limits: 5 per IP per hour, 20 per IP per day), returns the item so the submitter sees it as pending.
- `POST /api/public/votes`: takes `cardId` or `feedbackId`.
- `GET|POST /api/public/comments`, `POST /api/public/follows`: only when the workspace setting is on (404 otherwise).
- `/api/public/me`: also returns the visitor's followed items and own pending submissions.

### 4.3 Jobs
- `notify-new-feedback`, `notify-new-comment` (instant emails, idempotent by item id + recipient).
- `feedback-digest` (daily, per member with `daily`): repeatable BullMQ job.
- React Email templates in `src/server/email`.

### 4.4 Cache
Feedback pages use the same `"use cache"` loaders with `cacheTag("ws:<id>")`; every feedback mutation calls `invalidatePublic(workspaceId)`. Visitor state (own votes, pending items, follows) comes from `/api/public/me`, never from the cache.

---

## 5. UI

### Dashboard
- Sidebar: **Feedback** with an unread badge (pending count); the submenu lists boards, Inbox and Settings.
- **Feedback list** and **drawer** as in §1, reusing the card drawer's autosave hook, `RichTextEditor`, the category/tag pickers and the Votes tab.
- **Inbox:** a two-pane view (list + item); bulk actions on a selection; an empty state that says "You're all caught up".
- **Push to roadmap** dialog: roadmap + column select, editable title, "Create card". "Add to roadmap card": search cards in the workspace.
- **Card drawer:** new **Linked feedback** tab.
- **Board settings** and **Statuses** dialogs (like Edit roadmap and Categories).
- **Settings → Notifications:** the member's own email preferences.
- **Public settings:** comments/follows switches, comment approval, embed snippet for the feedback page.

### Public site
- Header tabs: Roadmap | Feedback (only the enabled ones).
- **Feedback page:** board switcher, search, sort (trending = votes in the last 30 days, top, new), status filter, **Submit idea** button. Rows: vote button, title, preview, status chip, category, comment count.
- **Item page/drawer:** title, rendered summary, status, category, tags, vote button, "Planned on the roadmap" link when linked to a public card, comments (when on), Follow (when on).
- **Submit dialog:** title, description, then sign-in (guest or magic link) if needed, then Turnstile. After submitting: "Thanks, the team will review it."
- Same accessibility rules as Phase 2.

---

## 6. Tests

### Vitest (services, test DB)
- **Isolation:** no board, status, item, link, comment, follow, vote or preference from account A can be read or changed with account B's context; public queries for host A never return B's items.
- **Visibility:** pending, rejected, private, archived, merged items and items on private boards never appear in public results, search or the sitemap; internal notes and pending comments are never public.
- **Triage:** public submissions start `pending` unless the board auto-publishes; approve/reject/bulk work; the inbox count matches.
- **Merge:** votes move without duplicates and both cached counts match the rows; follows and comments move; the merged slug resolves to a 308.
- **Push to roadmap:** creates exactly one card and link; status sync follows D5 on move/reopen.
- **Votes:** the D1 check constraint rejects a vote with both or neither target; the visitor claim works for feedback votes.
- **Submissions:** rate limits trip; a guest or verified voter is required (D6).
- **Import:** a feedback fixture CSV creates the expected items, statuses and totals; a second run doesn't duplicate.
- **Notifications:** the job sends one email per recipient, respects preferences, and is safe to run twice.

### Playwright
1. A guest submits an idea on the public site; it's hidden publicly, shows "Waiting for review" to the submitter, and appears in the admin inbox with a badge.
2. An admin approves it from the inbox; it appears on the public feedback page; an anonymous visitor votes.
3. An admin pushes the item to the roadmap; the public card shows 💡 1; moving the card to Done sets the item's status to Done.
4. An admin merges two items; the merged URL redirects and the vote total moves.
5. With comments on: a voter comments, the team replies and adds an internal note that the public page doesn't show.
6. Import the LoopedIn feedback CSV and see the items in the inbox.

---

## 7. Build order (each step leaves `check`, `typecheck` and `test` green)
1. Schema + migration `0003` (boards, statuses, items, links, comments, follows, preferences, votes change); workspace defaults; isolation tests.
2. Feedback services + admin list, filters and drawer (autosave, priority).
3. Triage inbox + sidebar count + bulk actions.
4. Push to roadmap, Linked feedback tab, status sync, merge, move, duplicate.
5. Public feedback page, item page, search, sort; `publicPathStatus` + sitemap.
6. Public submission + generalised voting on feedback.
7. Comments and follows (behind the workspace settings).
8. Notification preferences + email jobs + digest.
9. LoopedIn feedback import + CSV export.
10. Embed `data-page="feedback"`, Home dashboard tiles.
11. Playwright flows; update CLAUDE.md, doc 14 (new deps, if any) and PROGRESS.md.

## As built (2026-10-28)
- Step 1: schema in `src/server/db/schema/feedback.ts`, migration `0003` (tables, enums, `votes.feedback_id` + `votes_one_target_check`, new event types) and `0004` (data: default board + statuses for workspaces created before Phase 3). New workspaces are seeded by `seedFeedback` (`src/server/services/feedback-boards.ts`) from `seedWorkspace`. `claimVisitorVotes` already drops duplicate feedback votes. Tests: `src/server/services/feedback.test.ts`. Cross-account isolation tests come with the services in step 2.
- Step 2: `src/server/services/feedback.ts` (boards/statuses read, items CRUD, list with filters/sort/search, priority score in SQL), schemas in `src/lib/schemas/feedback.ts` (`priorityScore`, `PRIORITY_BUCKETS`), actions in `_actions/feedback.ts`. Admin page `/dashboard/<workspace>/feedback`: filters live in the URL (`?b=&q=&sort=&status=&category=&tag=&vis=&linked=&priority=&state=`) and run on the server; the drawer (`?feedback=<id>`) autosaves. A `done` status sets `completed_at`; Mark complete / Reopen picks the first `done` / `open` status. The card drawer's autosave hook, tag picker and voters list moved to `src/components/dashboard/` and are shared. Board settings and the statuses editor come with step 3.
- Step 3: triage inbox at `/dashboard/<workspace>/feedback/inbox` (pending items from every board, oldest first) with a sidebar badge and an "All feedback | Inbox" tab bar. Row checkboxes + a bulk bar on both views (inbox: Approve / Keep private / Reject; both: set status, set category; `bulkUpdateFeedback` can also add tags). Inbox shortcuts: j/k, x, Enter, a, p, r. Board settings (name, URL, description, public, auto-publish, delete-if-empty) and the statuses editor (colour, name, kind, reorder, delete-if-unused) are admin+. Lists sort with an id tie-breaker so rows don't reshuffle on refresh. Merge from the inbox comes with step 4. E2E: `e2e/feedback.spec.ts`.
- Gotcha found in step 3: don't sync derived state (selection, focus) from a list in a `useEffect` that calls setState. While a server action's automatic refresh is pending, React re-runs queued state updaters on every render, so the list gets a new identity each time and the effect loops ("Maximum update depth exceeded"). Derive it during render instead.

## Done when
- [ ] Feedback boards, statuses, categories and tags work; the admin list filters, sorts and searches; the drawer autosaves.
- [ ] New public submissions land in the triage inbox with a visible count and an email alert, and can be approved, kept private, rejected or merged in bulk.
- [ ] Feedback can be pushed to a new roadmap card or linked to an existing one; the card shows its linked feedback; status sync works.
- [ ] The public site has a Feedback tab with voting, submission, search and item pages; nothing pending, private or internal leaks.
- [ ] Comments and follows work when switched on and are invisible when off.
- [ ] Radius's 62 LoopedIn feedback items are imported; feedback and cards export to CSV.
- [ ] All Vitest and Playwright tests pass; `lint`, `typecheck` and `build` pass.
