# 30 — Dashboard + operator redesign ("Signal")

Status: **APPROVED and BUILT 2026-11-02** (design preview `docs/design/redesign-preview.html`; §2 decisions as recommended, R7 changed by the owner). See §5.

Scope: the team dashboard (`/dashboard/[workspace]/…`) and the operator console (`/admin`). **Public sites, embeds, the widget and emails keep their current look** (they carry the customer's brand).

## 1. The design in one paragraph

Warm graphite neutrals, ink-black primary buttons, colour only where it means something. A workspace rail + a dimmed sidebar + one inset "sheet" that holds the work. Every idea and card shows a **stage tick** (6 bars: New → Under review → Planned → In progress → Shipped → Announced). Home is a "Needs you" queue under a **Signal line** (counts per stage, "shipped but not announced" nudge). ⌘K jumps anywhere. Type: Schibsted Grotesk (headings, big numbers), Geist (UI), Geist Mono (ids, meta). The operator console uses the same system, always dark, amber for Pro and warnings.

## 2. Decisions (my recommendation first)

| # | Question | Recommendation | Alternative |
|---|----------|----------------|-------------|
| R1 | Stage of a feedback item | **Derived, no schema change:** review `pending` → New; status kind `open` → Under review; `planned` → Planned; `in_progress` → In progress; `done` → Shipped, or **Announced** when a linked card is in a published update. `declined` shows a muted "Declined" tick (no bars) | — |
| R2 | Stage of a roadmap card (columns are free-form today) | **Add `stage` to `roadmap_columns`** (`review / planned / in_progress / shipped`, migration fills it: `is_done` → shipped, others by position: first → planned, rest → in progress). Editable in Edit roadmap next to each column. A card in a shipped column that's in a published update shows Announced | Guess from column order every time (no migration, wrong for custom boards) |
| R3 | "Likely duplicates" in Feedback | **Postgres full-text** on the existing search vector (top matches above a rank threshold within the workspace, not merged/declined). No new service, no `pg_trgm` | Skip the feature for now |
| R4 | "It's live" email to voters when an update with linked shipped cards is published | **Yes, a toggle in the update's side panel (on by default when cards are linked)**: one BullMQ job per update, idempotent (sent flag per update + voter), respects unsubscribes and suspension. Linked cards then count as Announced | Leave emails as today (subscribers + card followers only) |
| R5 | Articles "people ask things your articles don't answer" tip | **Later** (needs logging public help-centre searches). This redesign shows the "% helpful" column from the existing ratings | Build search logging now |
| R6 | Operator "activity" meter per account | **Weeks with activity in the last 6 weeks** (any vote, feedback, card or update event) | Last sign-in date only |
| R7 | Workspace switching | **Changed by the owner (2026-11-02): no rail.** The workspace dropdown at the top of the sidebar (with the workspace icon) is the only switcher; the account avatar sits in the sidebar footer | Rail of workspace marks (built in step 1, removed) |
| R8 | Feedback detail | **Inline third pane on wide screens (≥ 1280 px)**, today's drawer below that | Always the drawer |
| R9 | Theme | Dashboard follows the system with the toggle (as today); operator console always dark | — |

## 3. Steps (each: lint, typecheck, unit tests, affected e2e, screenshots light + dark, commit)

1. **Foundation.** Dashboard-scoped tokens in `globals.css` (`:root:has([data-dashboard])` and `[data-platform-admin]`, so public sites are untouched), Schibsted Grotesk via `next/font`, shadcn components retuned (button, input, card, badge, tabs, dialog, sheet, dropdown, select, tooltip radii/colours). New shell: dimmed collapsible sidebar + inset sheet + top bar (breadcrumbs + page actions slot). ⌘K palette (jump to pages, create, search ideas / cards / articles through a server action using the existing search services).
2. **Stage system.** `src/lib/stages.ts` (`feedbackStage()`, `cardStage()`, labels, CSS colour vars), `<StageTick>`; R2 migration + Edit roadmap column stage picker; `announced` derived in the services (R1). Unit tests for the mapping + cross-tenant test for anything new in services.
3. **Home.** `services/signal.ts` (counts per stage for 7/30/90 days, untriaged, unanswered comments, duplicates count, shipped-not-announced, most-voted with votes per week, median idea → shipped, loop-closed %, voters + companies). Signal line, Needs you, Loudest requests, stats, activity feed.
4. **Feedback.** Three-pane triage (views / list / detail, R8), stage ticks, vote boxes, votes-per-week bars, voters' companies, linked card, duplicates (R3), internal notes styling, composer with Public reply / Internal note, keyboard bar (J/K, S, M, E, ⌘↵). Comments moderation page restyled.
5. **Roadmap.** Board columns with stage colour, new card face (cover, objective, tick, ETA, votes), drawer restyle with the stage journey and tabs; filters panel, Edit roadmap and objectives dialogs restyled.
6. **Updates.** Three columns (list grouped Scheduled / Published / Drafts, editor on a page, side panel: publish time, audience, toggles, "Closes the loop for N people"), "Shipped in this update" block from linked cards; R4 job + email. Subscribers page restyled.
7. **Articles.** Collection tree + table with "% helpful"; editor restyled.
8. **Settings, Public settings, Widget.** Grouped settings nav (Workspace / Account / Developers / You), every settings page on the new rows layout; Branding keeps its live preview.
9. **Operator console.** Move `/admin` onto the same tokens (always dark), stat strip, signups chart, plan mix, needs attention, accounts table with activity meter (R6), account page, invite, activity timeline.
10. **Wrap-up.** Onboarding + auth pages get the new type and colours (layout unchanged), e2e selectors updated, "As built", PROGRESS, CLAUDE.md (new UI rules: stage ticks, tokens, shell).

## 4. Done when

- [x] Every dashboard and admin screen uses the new shell and tokens, in light and dark.
- [x] Stage ticks on ideas, cards, search results and Home; Signal line numbers come from real data.
- [x] ⌘K works everywhere in the dashboard.
- [x] Public sites, embeds, widget and emails look as before (except R4's new email and the public Ideas empty-state fix).
- [x] Lint, typecheck, unit (308) and e2e (33 + 1 skipped) tests green.

## 5. As built (2026-11-02)

- **Shell:** tokens in `globals.css` scoped to `[data-dashboard]` (and `[data-app-shell]` for sign-in/onboarding); Schibsted Grotesk as `--font-display`; dimmed collapsible sidebar (switcher, public address, ⌘K button, nav with inbox count, plan note, avatar + theme), inset sheet that scrolls on its own (`main` is `relative`; the page itself never scrolls). **Owner change (R7): no workspace rail.** Full-bleed pages fill the sheet with `absolute inset-0` (never `has-[...]`: Next keeps earlier pages mounted hidden). Dropdowns size to their items.
- **⌘K:** `CommandMenu` (pages + `quickSearch` over ideas/cards/articles, tenant-scoped).
- **Stages:** `src/lib/stages.ts`, `<StageTick>`, `<StageJourney>`; `roadmap_columns.stage` (migration 0017, guessed from names, editable in Edit roadmap); Announced = in a published update (`services/stages.ts`, columns always table-qualified + snake_case). A pending idea the team already moved on shows its real stage.
- **Home:** `services/signal.ts` (signal counts, shipped-not-announced, needs-you, loudest with weekly votes, outcomes, activity) + the new page; traffic stats kept.
- **Feedback:** three panes (views / list / detail inline at ≥ 1440 px, drawer below), J/K/X/Enter (+ A/P/R in the inbox), review bar in the detail, likely duplicates with merge (`similarFeedback`). The inbox lists everything its count includes.
- **Roadmap:** stage-coloured columns, new card face, stage journey in the drawer; More menu: Unpublish (draft) / Publish, Delete roadmap; Edit roadmap redesigned (section nav, title-left rows, fixed footer).
- **Updates (R4):** voters of the shipped cards and their ideas get a `voted-shipped` email once (opt-out `/api/public/optout`), per-post `notify_voters` (migration 0018) with a "Closes the loop" note; list rows with stage ticks.
- **Articles, Settings, Subscribers:** stats strips, % helpful meter, grouped settings nav, shared Selects instead of bare `<select>`s.
- **Operator console:** same system, always dark (control room), amber for Pro.
- **Not done (R5, later):** "people ask things your articles don't answer" (needs help-centre search logging).
