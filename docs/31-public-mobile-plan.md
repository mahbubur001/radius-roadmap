# 31 — Public site on mobile

Status: **APPROVED and BUILT 2026-11-03** (owner: "go for it" on the preview `docs/design/public-mobile-preview.html`). See §4. The WordPress plugin plan moves to doc 32.

Scope: the public site (roadmap, ideas, updates, help centre, detail pages) and its embeds below 768 px. Desktop keeps its current layout. The dashboard is not part of this.

## 1. Decisions (as in the preview)

| # | Decision |
|---|----------|
| M1 | **Compact sticky header:** logo + name + sign-in in one row; module tabs underneath, scrolling sideways, active tab underlined in the brand colour. |
| M2 | **Roadmap, one column at a time** below 768 px: sticky column chips with counts switch columns; cards full width. Desktop keeps side-by-side columns. |
| M3 | **Details as bottom sheets** on phones (card, idea): rounded top, grab handle, ~92% height, back button closes; right-hand drawer on desktop as today. |
| M4 | **Ideas: floating "Share an idea" button** on phones opening the form full-screen; the desktop side form stays. |
| M5 | **Look-alike ideas while typing** in the idea form (public, rate-limited; same Postgres full-text search as the dashboard's duplicates), "vote instead?" links. |
| M6 | **Touch rules:** tap targets ≥ 44 px, inputs 16 px (no iOS zoom), safe-area padding at the bottom, no hover-only actions. |
| M7 | White-label unchanged: brand colour drives buttons, active tab, votes; site theme (light/dark/system) unchanged. |

## 2. Steps (each: lint, typecheck, tests, phone + desktop screenshots, commit)

1. Header (M1) + touch basics (M6).
2. Roadmap column chips + full-width cards (M2); card sheet on phones (M3).
3. Ideas: FAB + full-screen form, idea sheet (M3, M4).
4. Look-alike ideas in the form (M5): public API route + service with a cross-account test.
5. Updates and help centre polish at phone width; embeds checked; e2e at a phone viewport for roadmap + ideas.

## 3. Done when

- [x] Every public page works at 390 px without sideways scrolling (except the tab strip and chips).
- [x] Desktop looks as before.
- [x] Lint, typecheck, unit (310) and e2e green (34 + 1 skipped; `roadmap.spec` "card attachments…" is flaky under parallel load, passes alone), plus `e2e/mobile.spec.ts`.

## 4. As built (2026-11-03)

- **Header** (`site-shell.tsx`): sticky; phones get logo + name + sign-in on one row and the module tabs underneath (scroll sideways, brand underline); one row from `sm` up.
- **Roadmap** (`public-board.tsx`): below `md` a sticky chip strip (`tablist` "Roadmap columns") shows one column at a time; desktop unchanged.
- **Sheets:** `DetailSheet` (`components/public/detail-sheet.tsx`) is a bottom sheet with a grab handle on phones (92% high, or content height with `fit` for forms) and the right drawer from `md` up; used for cards, ideas and the idea form. `useMedia` moved to `src/lib/use-media.ts` (`PHONE`, `WIDE`).
- **Ideas:** floating "Share an idea" on phones; taller filters; the form's ids are unique per copy (side panel + sheet) so labels point at the right field.
- **Look-alike ideas:** `similarPublicIdeas` (visible ideas in the workspace, any shared word, best first; cross-account test) + `GET /api/public/feedback/similar` (60/min per IP) shown under the title as "Similar ideas, vote instead?".
- **Aligned with the preview (owner, 2026-11-03):** phone roadmap cards have a vote box on the left; the card on a phone is one scrolling page without tabs (status pill, objective, title, planned/comments line, full-width Vote button, description, tags, features, attachments, "Requested in" linked ideas with links, comments); `PublicCard.requestedIn` loaded with the card details; Ideas sort and status as chips on phones (divider between them); Help categories in two columns. Not built: Follow on cards (visitors can only follow ideas today) and a comment box pinned to the bottom.
- **Dev note:** a long-running dev server once served stale public data after votes (vote e2e failed until restart); restart `pnpm dev` if public pages stop updating.
- **Dev fix:** Turbopack's dev filesystem cache is off (`experimental.turbopackFileSystemCacheForDev: false` in `next.config.ts`); reusing it across restarts sent browsers into a reload loop.
