# 31 — Public site on mobile

Status: **APPROVED 2026-11-03** (owner: "go for it" on the preview `docs/design/public-mobile-preview.html`). Being built. The WordPress plugin plan moves to doc 32.

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

- [ ] Every public page works at 390 px without sideways scrolling (except the tab strip and chips).
- [ ] Desktop looks as before.
- [ ] Lint, typecheck, unit and e2e green, plus a phone-viewport e2e.
