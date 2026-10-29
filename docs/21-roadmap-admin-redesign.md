# 21 — Roadmap admin: LoopedIn layout + missing card features

Status: **APPROVED 2026-10-29** (all recommendations R1–R5 in §3). Building A → B → C.

Source: 11 LoopedIn screenshots from the owner (2026-10-29): the roadmap board (light and dark, filters panel open, the objective quick-picker, the More menu) and the card drawer (General, Features, Linked feedbacks, Attachments, Votes, Comments tabs). Builds on doc 19 (Phase 2 roadmap) and doc 20 (Phase 3 feedback). Same direction as the sidebar and feedback-list redesigns done earlier on 2026-10-29.

---

## 1. What LoopedIn shows vs. what we have

### 1.1 Board page

| LoopedIn | Ours today | Gap |
|---|---|---|
| Roadmap name as the page title | Roadmap `Select` in the toolbar | Title + switcher in the heading |
| Toolbar: **Toggle filters**, **Completed cards**, **Edit Roadmap**, **Summary view**, **More ⋮** | Category/tag/visibility selects, "Show completed" switch, Categories, Edit roadmap, Import, View public | Re-arrange into LoopedIn's buttons |
| More ⋮ → Add objectives, Export…, Import roadmap | Categories / Import buttons | Menu; **Export is new** |
| Search under the toolbar, right-aligned | Search in the toolbar | Move |
| **Filters panel** on the left, collapsible sections: Objective (radio), Tags, Public status, Votes, Description, Attachments, Comments, Followers, Feedbacks; Reset | 3 selects | **New panel**; several filters are new |
| Column = dark panel, bold title, round blue **+** | Light panel, small title + count, grip, plain + | Restyle |
| Card: **left border in the objective colour**, objective dot + name with a ▾ **quick-picker** (search, ADD NEW +, list), title, summary (in summary view), vote box, 💡 | Top colour strip, category name, title, feature progress bar, 👍 count, 💡, lock | Restyle; **quick-picker is new** |
| Summary view toggle (shows/hides summaries on cards) | Not there | New (per browser) |

### 1.2 Card drawer

| LoopedIn | Ours today | Gap |
|---|---|---|
| Wide two-pane sheet: content + **"More options" rail** | Single-pane sheet, actions in a ⋯ menu | Redesign |
| Header: objective, vote box, big title | Title input, badges | Restyle |
| Tabs: General, Features (n), Linked Feedbacks (n), **Attachments (n)**, Votes (n), **Comments (n)** | General, Features, Votes, Linked feedback | **Attachments and Comments are new** |
| General: Summary editor, Public visibility select, Objective (searchable, ADD NEW), Tags, Planned for | Public title, Description, Category, Tags, Planned for, public switch | Mostly restyle; objective combobox with inline create |
| Rail: **Mark as Complete**, **Follow**, **Move to…**, **Copy to…**, **Duplicate card**, View public card, Delete card | Complete, Archive, Copy public link, Delete (menu) | **Follow, Move to (another roadmap), Copy to, Duplicate are new** |
| Rail footer: Submitted by, Created | Not shown | Add |
| Footer: "All changes saved – Last updated …" | Autosave indicator in header | Move |
| Votes: name + email + time, "N anonymous votes" | Name, email, city; anonymous + imported counts | Add the vote time |
| "Upgrade to Startup" boxes | — | Ignore: no plan gating until Phase 6 |

---

## 2. Scope

### Step A — Board page (UI only, no schema change)
- Heading: roadmap name with a ▾ switcher (other roadmaps, New roadmap).
- Toolbar: Toggle filters · Completed cards (toggle) · Edit roadmap · Summary view (toggle) · More ⋮ (Objectives…, Export CSV, Import roadmap, View public roadmap). Search under it.
- Filters panel (left, collapsible sections, Reset): Objective, Tags, Public status, Votes (has votes / none), Description (has / empty), Feedbacks (linked / not). Attachments, Comments and Followers sections appear once step C ships. Filter state stays in the URL like the feedback list.
- Columns and cards restyled as in §1.1, with the objective quick-picker on each card (search, pick, ADD NEW → name + colour).
- Summary view: remembered per browser (localStorage), like the sidebar.

### Step B — Card drawer redesign (UI + small services)
- Two-pane layout, header, tabs with counts, rail with actions, Submitted by / Created, footer save state.
- Objective combobox with search and inline create.
- **Duplicate card** (copies content, tags, features; not votes, not links), **Move to…** (another roadmap + column), **Copy to…** (duplicate into another roadmap + column). Services in `cards.ts` with cross-account tests.
- Votes tab: add the vote date.

### Step C — New card data (schema + migration)
- **Attachments**: `card_attachments` (account, workspace, card, storage key, file name, size, content type, uploaded by, created). Upload via `src/server/storage` `createUpload` under a tenant prefix; drag-and-drop zone; list with download and delete. Max size and types like image uploads (10 MB, images/PDF/common docs).
- **Comments on cards** (team only in this step): extend `comments` with a nullable `card_id` (exactly one of `feedback_id` / `card_id`, check constraint). Plain text, auto-linked URLs, edit/delete own. Public card comments come with doc 20 step 7 behind the same workspace setting.
- **Follow**: `card_follows` for **team members** (user id). Stored now; the notification email is sent from Phase 4 with the other follow emails.
- **Export CSV** of a roadmap (title, public title, column, objective, tags, votes, planned for, public, completed, created) — doc 20 already lists CSV export; this delivers the roadmap half.

### Not in this doc
- Plan gating / "Upgrade" boxes (Phase 6).
- Public-site changes (the public roadmap already has its own design, doc 15).
- Emails for follows (Phase 4).

---

## 3. Decisions needed (my recommendation first)

| # | Question | Recommendation |
|---|---|---|
| R1 | Call categories **"Objectives"** in the roadmap UI, like LoopedIn? | Yes for the roadmap (labels only; table stays `categories`). Feedback keeps "Category". |
| R2 | Attachments on cards were "Later" in doc 19 §1. Pull them in now (step C)? | Yes |
| R3 | Card comments: team-only now, public later with doc 20 step 7? | Yes |
| R4 | "Follow" for team members now (stored, emails in Phase 4)? | Yes |
| R5 | Order: A → B → C, each step committed separately; then back to doc 20 step 5? | Yes |

---

## 4. Tests
- Vitest: duplicate / move / copy across roadmaps (and rejected across accounts); attachments, comments and follows scoped by account; CSV export only contains the caller's cards.
- Playwright (`e2e/roadmap.spec.ts`): filters panel narrows the board and Reset clears it; quick-picker changes and creates an objective; drawer rail actions (complete, duplicate, move to another roadmap); attachment upload + delete (local storage driver); team comment add + delete. Existing flows updated for the new toolbar.

## 5. Done when
- Board and drawer match the screenshots in layout (our theme colours), in light and dark mode.
- All rail actions and tabs work; lint, typecheck, test, test:e2e and build pass.
