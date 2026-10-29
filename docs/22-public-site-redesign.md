# 22 — Public site redesign (LoopedIn layout) + "Objective" naming

Status: **APPROVED 2026-10-29** (O1 and P2–P8 as recommended in §4). Building steps 1 → 4.

Sources: 8 screenshots of the live LoopedIn public site for Classified Listing (2026-10-29): roadmap board, card drawer, "Vote added" modal, scrolled board, Updates, Ideas, Article. Builds on doc 15 (public audit, approved §9), doc 19 (public roadmap as built), doc 20 (public feedback = "Ideas", steps 5–8) and doc 21 (admin redesign).

---

## 1. "Objective" vs "Category" (owner request)

### What we have now
- One table, `categories` (name + colour, per workspace), used by **roadmap cards** (`roadmap_cards.category_id`) **and feedback items** (`feedback_items.category_id`). "Push to roadmap" copies it from the idea to the card.
- The UI says "Objective" on the roadmap since doc 21, but "Category" in the feedback list/drawer, the public card drawer, the code and the database.
- Updates (Phase 4) and Articles (Phase 5) don't exist yet. LoopedIn gives each of them its own coloured categories (e.g. New feature / Improvement / Fix for updates).

### Recommendation (O1)
1. **Rename `categories` → `objectives` everywhere**: table, `category_id` → `objective_id` on cards and feedback items, indexes, services (`listObjectives`…), schemas, actions, URL params, UI labels, LoopedIn import mapping. An objective is a business goal ("Revenue Growth", "Onboarding"), and an idea and the card it becomes should share it, so **feedback keeps using objectives too** (labelled "Objective" there as well).
2. **Updates and Articles get their own tables** when they're built: `update_categories` and `article_categories` (name, colour, position, per workspace), labelled "Category". No shared "categories" table, so the word means one thing per module and nothing collides.
3. Migration with `ALTER TABLE … RENAME` / `RENAME COLUMN` (no data copy, no data loss). Drizzle's generator asks interactively about renames, so this one is written as a custom migration and checked against the snapshot.

Rejected:
- *Rename the labels only*: the code and database would keep saying "category", which is exactly the confusion the owner wants gone, and it would clash with the update/article categories later.
- *Objectives for cards, a separate category for ideas*: two tag-like fields on ideas, and push-to-roadmap would have to map one to the other. LoopedIn's audit (doc 16 §8 #3) showed teams misuse a second field as a status anyway; we already have statuses.

---

## 2. Analysis: LoopedIn vs ours

### 2.1 Site shell (every page)
| LoopedIn | Ours | Change |
|---|---|---|
| Tabs: **Roadmap · Updates · Ideas · Article**, active tab as a soft pill | Logo + name, one "Roadmap" tab | Tabs for each enabled module (see P2) |
| Right: **Sign Up** (text) + **Log in** (primary button) | "Sign in" button (voter magic link / guest) | One **Log in** button; the magic-link flow covers new and returning voters (P3) |
| No logo in the header (their page sits inside radiustheme.com) | Logo + workspace name | Keep ours: white-labelled sites need the brand |
| Footer "Powered by LoopedIn" | "Powered by Radius Roadmap" | Keep (removable on paid plans, Phase 6) |

### 2.2 Roadmap
| LoopedIn | Ours | Change |
|---|---|---|
| Title "**Classified Listing - public roadmap**" (roadmap public title), search box on the right, rule under it | "Roadmap" heading, search + "Show completed" switch | Public title + right-aligned search; drop the switch (P6) |
| Column title + **count pill** (coloured badge) | Title + plain count, grey panel | Pill count, no panel background |
| Cards **stacked edge to edge** in a bordered column, **left border in the objective colour** | Separate cards, colour strip on top | Left border, stacked list |
| **Objective chip** (dot + name, bordered pill) above the title | Plain grey objective text | Chip |
| Title, summary (2–3 lines, links clickable) | Title, summary | Same, links in summary clickable |
| Footer row: **↑ votes │ 💬 comments**, 💡 badge on the right when ideas are linked | Vote box on the left, 💡, feature progress | Footer row; keep feature progress bar when a card has features |
| Click → **drawer**: title, **♡ vote count**, tabs **Details / Comments**; Details shows Category chip and Tags ("Untagged") | Drawer: vote box, title, column + objective; summary, features | Drawer with Details / Comments tabs; Details: Objective chip, Tags, status (column), planned for (if shown), features progress, summary, linked ideas count. **↑ icon, not ♡** (P5) |
| Voting shows a modal "**Vote added!** Your vote has been added [OK]" | Button toggles, count updates | Toast "Vote added" instead of a modal (P4) |

### 2.3 Ideas (= doc 20 public feedback, steps 5–6)
| LoopedIn | Ours | Change |
|---|---|---|
| "Ideas" title; list on the left, **"Add new" form always visible on the right**: Title*, More details (small rich-text toolbar: bold, lists, link, image), Name*, Email*, terms checkbox, reCAPTCHA note | Not built (doc 20 planned a "Submit idea" dialog) | Build doc 20 steps 5–6 with this layout (P7): side form on desktop, button + sheet on mobile; Name/Email hidden when the voter is signed in; Turnstile instead of reCAPTCHA (doc 15 §9 #4) |
| Empty list: "No items found." | — | Friendly empty state + "Be the first to suggest an idea" |

### 2.4 Updates (Phase 4)
| LoopedIn | Change |
|---|---|
| Search + **Categories ▾** filter, list of posts; "No items found." | Same layout when Phase 4 ships, with `update_categories` (coloured). Defaults from doc 15 §9 #5: New feature, Improvement, Fix, Maintenance, Announcement, Coming soon |

### 2.5 Article / knowledge base (Phase 5)
| LoopedIn | Change |
|---|---|
| Centered search, **Recent articles**, **Categories** grid; "Nothing published yet." | Same layout when Phase 5 ships, with `article_categories` |

---

## 3. Scope of this plan

### Step 1 — Objective rename (O1)
Custom migration (`categories` → `objectives`, `category_id` → `objective_id` on `roadmap_cards` and `feedback_items`, index/constraint names), Drizzle schema + snapshot, services, schemas, actions, admin + public UI labels, URL param `obj` stays. Tests updated; a test that a renamed objective still links ideas and cards.

### Step 2 — Public shell
- Header tabs from the workspace's enabled modules (P2): **Roadmap** and **Ideas** now; **Updates** / **Article** appear when Phases 4 / 5 ship.
- Public settings: a switch per module ("Show on the public site"), default on for modules that exist.
- **Log in** button (magic link / guest, existing voter flow); signed-in voters see their menu.
- Embed mode unchanged (no header).

### Step 3 — Public roadmap restyle
Title, search, columns with count pills, stacked cards with objective left border + chip, ↑ / 💬 footer, 💡 badge, clickable links in summaries, card drawer with Details / Comments tabs (Comments tab only when comments are on — doc 20 step 7), toast on vote. Card page (`/roadmap/<slug>`) uses the same Details layout.

### Step 4 — Ideas page (doc 20 steps 5–6, this design)
List (search, sort trending/top/new, status filter, board switcher if more than one public board), item drawer + item page, side "Add new" form, voting on ideas, `publicPathStatus` + sitemap — exactly as doc 20 §1 already specifies, with the layout above.

### Later (designs fixed here, built in their phases)
- Step 5 (Phase 4): public Updates page (§2.4).
- Step 6 (Phase 5): public Article page (§2.5).

### Not in this plan
- Public comments themselves (doc 20 step 7) — step 3 only adds the tab slot.
- Terms checkbox content: needs Terms / Privacy URLs per workspace; added as two optional fields in Public settings in step 4 (checkbox only shows when a URL is set).

---

## 4. Decisions needed (my recommendation first)

| # | Question | Recommendation |
|---|---|---|
| O1 | Rename `categories` → `objectives` (DB + code + UI), used by cards **and** ideas; Updates/Articles get their own `*_categories` tables | **Yes** (§1) |
| P2 | Header tabs: all four always, or only enabled modules? | **Only enabled + built modules** (no empty "No items found" tabs) |
| P3 | "Sign Up" + "Log in", or one button? | **One "Log in"** (magic link signs up and logs in) |
| P4 | Vote confirmation: modal like LoopedIn, or toast? | **Toast** (a modal on every vote interrupts) |
| P5 | Vote icon in the drawer: ♡ like LoopedIn, or ↑ everywhere? | **↑ everywhere** (one meaning) |
| P6 | Drop the public "Show completed" switch? | **Yes**: the Done column shows completed cards; columns can already be hidden from the public |
| P7 | Ideas: always-visible side form (LoopedIn) or "Submit idea" dialog (doc 20)? | **Side form on desktop**, button + sheet on mobile |
| P8 | Order: step 1 → 2 → 3 → 4, each committed separately | **Yes** |

---

## 5. Tests
- Vitest: migration keeps every card's and idea's objective; services renamed; cross-account checks still pass.
- Playwright: header shows only enabled modules; roadmap page layout smoke (column counts, objective chip, drawer Details tab); vote shows a toast; Ideas flows from doc 20 §6 (submit as guest → pending → approve → public → vote).

## 6. Done when
- No "category" left for objectives in DB, code or UI; update/article categories are separate.
- Public roadmap and Ideas match the screenshots in layout (our theme), light and dark; lint, typecheck, test, test:e2e, build pass.

---

## As built

- **Step 1 (2026-10-29):** migration `0006_objectives_rename` (hand-written: `categories` → `objectives`, `category_id` → `objective_id` on `roadmap_cards` and `feedback_items`, constraint/index names, and the `roadmaps.display` key `showCategories` → `showObjectives`). Drizzle's `--custom` migration copies the previous snapshot, so `0006_snapshot.json` was rebuilt from the schema; `drizzle-kit generate` reports no changes. Code, schemas, actions, services, admin + public UI and tests renamed (`objectives-dialog.tsx`, `listObjectives`, `ObjectiveOption`…). Dev DB check: every card and idea kept its objective. 133 unit + 17 e2e pass.
