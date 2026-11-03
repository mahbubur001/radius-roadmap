# 32 — Public site "Transit"

Status: **APPROVED + BUILT 2026-11-03** (owner: build exactly like `docs/design/public-transit-preview.html`; the 14 decisions below agreed before starting, 15–16 added during the build).

Scope: every public page and embed (roadmap, ideas, updates, help, and their detail pages), desktop and phone. Replaces the look of doc 22 and the phone layout of doc 31. Behaviour (voting, sign-in, review, emails, links, SEO, custom domains) and the dashboard don't change.

**Rule:** the build matches the preview 100%. After each step, the built page and the preview are screenshotted at 1360 px and 390 px and compared side by side before the step counts as done.

## 1. The design (from the preview)

- Tokens: paper `#f4f5f7` / sheet `#fff` / ink `#0d1014` / ink2 `#4a515c` / ink3 `#8a919c` / rules `#e1e4e9`, `#cfd3da`; dark: `#0b0d10` / `#13161b` / `#eef0f3` / `#a7aeb9` / `#6b7280` / `#22262d`, `#313640`. Brand colour only on the line, vote buttons, highlights.
- Type: Familjen Grotesk (display), Hanken Grotesk (text), JetBrains Mono (numbers, labels, small caps).
- Header: mark + name, pill nav, Sign in (outline), Share an idea (ink). Phones: compact header + dark bottom dock with a raised brand "+".
- Roadmap: eyebrow + big title + summary, dark scoreboard (Now / Next / Later / Shipped, live dot), search + topic chips, the line with stations and carriage cards (big mono vote box, small-caps topic, title, description, ETA / comments / ideas).
- Card and idea details: the ticket (stamp, perforated edge, big vote button, requested-in, conversation, pinned reply box); bottom sheet on phones.
- Ideas: ledger (votes / idea / status / talk), "your ideas waiting" box, sticky form ticket with look-alikes.
- Updates: journal (big date in the margin, kind label, title, cover, body, "Shipped from the roadmap", reactions), subscribe pill.
- Help: big search, numbered index, "Most read".

## 2. Where reality differs (agreed with the owner)

| # | Decision |
|---|----------|
| 1 | Hero title = the roadmap's public title, summary under it; the last word in the brand colour. |
| 2 | Stations are stages: in progress = Now, planned = Next, review = Later, done = Shipped. Columns with the same stage share a station; the column name shows as a small label on its cards when a station has more than one column. Empty stations are hidden. |
| 3 | Scoreboard counts and "this year" / "updated" come from real data. |
| 4 | Topic chips = the roadmap's objectives (hidden when objectives are hidden). |
| 5 | Shipped station shows the latest 3, then "+N more shipped" to expand. |
| 6 | When a roadmap hides vote counts, the vote box shows without a number. |
| 7 | Signed-out visitors also see name, email (and terms) in the form ticket, same style. |
| 8 | Several boards / roadmaps, the status filter, update search and categories use the preview's chip style next to its chips. |
| 9 | Posts without an uploaded cover show no cover (no placeholder art). |
| 10 | Help "Most read" = most viewed articles, falling back to featured. |
| 11 | The dock shows only enabled modules; the "+" only when Ideas is on. |
| 12 | A customer font from Branding replaces display and text; numbers keep JetBrains Mono. |
| 13 | Pages not drawn in the preview (idea ticket, card/idea/post/article pages, help category page, sign-in dialog, embeds) reuse the same parts. |
| 14 | The ticket's reply box only when comments are on. |
| 15 | (Owner, during the build) No "Share an idea" button in the desktop header: the Ideas page has the form ticket; phones keep the dock's "+". |
| 16 | Updates are read in the journal itself, so a post title goes straight to its page (no drawer). |
| 17 | (Owner, after the build) No scoreboard: the stations already show their counts. The hero is title + summary at full width, with one mono line under it: live dot · updated … · N shipped this year. |
| 18 | (Owner) Objective colours as a small 8 px square (`ObjectiveMark`, same shape as the status squares) before the objective name on cards, topic chips, the card / idea ticket and the ideas ledger. Preview: `docs/design/public-objective-colors-preview.html` (option A). |

## 3. Steps (each: build, side-by-side check at both sizes, lint, typecheck, tests, commit)

1. Tokens, fonts, header, footer, phone dock.
2. Roadmap: hero, scoreboard, tools, the line, carriage cards.
3. Ticket for cards (drawer on desktop, sheet on phones) and the card page.
4. Ideas: ledger, waiting box, form ticket with look-alikes, idea ticket and idea page.
5. Updates journal and post page.
6. Help index, category and article pages.
7. Sign-in dialog, embeds, dark mode pass; e2e (desktop + phone); docs.

## 4. Done when

- [x] Every public page matches the preview side by side at 1360 px and 390 px, light and dark.
- [x] The 16 decisions hold; behaviour unchanged.
- [x] Lint, typecheck, unit and e2e green (one known flaky dashboard test aside).

## 5. As built

| Step | Commit | Notes |
|------|--------|-------|
| 1 Tokens, fonts, header, footer, dock | 8e91726 | Familjen Grotesk / Hanken Grotesk / JetBrains Mono via next/font (`--t-display`, `--t-text`, `--t-mono`; a Branding font replaces the first two). Tokens `paper`, `sheet`, `ink3`, `rule2`, `tint` in `globals.css`. `PublicDock` (phones only, enabled modules, "+" → `ideas?share=1`). |
| 2 Roadmap | 3cf1b42 | `src/lib/stations.ts` maps columns to stations. The live line (decision 17; it replaced the scoreboard) reads `getPublicRoadmap().stats` (ignores the search); "updated …" is rendered client-side (`UpdatedLabel`, no `new Date()` while prerendering). Vote box = `VoteButton variant="car"`. |
| 3 Card ticket | 83fe222 | `DetailSheet ticket` (floating drawer / 92% sheet, own close button, darker scrim). `Ticket`, `Stamp`, `Meta`, `Label`, `From` in `card-detail.tsx`; comments split into `useComments` + `CommentThread` + `CommentCompose`. |
| 4 Ideas | 10f1c47 | Ledger (`VoteButton variant="ledger"`), waiting box, form ticket (`IdeaForm` restyled, button "Post idea"), idea ticket. Sort + status + boards as chips. The floating phone button is gone: the dock's "+" opens the form sheet. A "Share an idea" pill shows on tablets and in embeds, where there is neither the form ticket nor the dock. |
| 5 Updates | 3807141 | Journal entries (`UpdateEntry`); "Shipped from the roadmap" now carries card votes (hidden when that roadmap hides votes) and "N people asked". Decisions 15, 16. |
| 6 Help | d33ed9a | Numbered index, Most read (`events` article views in 90 days → featured → newest), ledger rows, category chips, article sheet. |
| 7 Sign-in, embeds, dark, docs | this commit | Sign-in dialog as a ticket (same labels). Embeds hide the heroes and keep the rest. Dark mode checked on every page. |

Side-by-side screenshots were made with throwaway Playwright scripts (preview rendered from the `<textarea id="site">` source with the same hash parameters).
