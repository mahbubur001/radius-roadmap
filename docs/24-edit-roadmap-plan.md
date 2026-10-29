# 24. Edit roadmap redesign (LoopedIn parity)

Status: **APPROVED 2026-10-29** (R1–R7 as recommended). **Built 2026-10-29** (see "As built").
Source: 5 LoopedIn screenshots of the "Edit roadmap" modal (owner, 2026-10-29).

## 1. What LoopedIn shows vs what we have

| LoopedIn section / setting | Ours today (`roadmap-settings-dialog.tsx`) | Gap |
|---|---|---|
| Blue header modal, sections as white cards, footer **Discard / Save changes** | Plain shadcn dialog; title/summary/display saved with "Save roadmap", columns save instantly | Layout + one save for everything |
| **General**: Internal / Public title as tabs | Two inputs side by side | Tabs |
| Internal / Public summary in a **rich text editor** | Plain textareas (`text` columns) | Rich text |
| **Emails**: "followers of roadmap cards are notified when they complete" | Nothing. `card_follows` (team) exist; idea followers get emails only via published Updates (doc 23 step 6) | New per-roadmap switch + completion emails |
| **Columns**: horizontal tiles, name, Public status, Delete, "+ Add column" tiles | Vertical list, name, Public, Done, delete; add form | Tile layout, staged changes. We keep our extra **Done** switch (drives "completed") |
| **Public roadmap** switch + public URL | Switch, URL only in the description | Show URL |
| Embeddable roadmap | `public-settings/embed-settings.tsx` (workspace level) | Link only |
| Logo on public roadmap | Always shown | New `showLogo` (workspace) |
| Display comments / public by default / allow comments / allow follows | Workspace public-site settings (`commentsEnabled`, `approveComments`, `followsEnabled`) | Link only (see R6) |
| Section headings: rename + show/hide Roadmap, Updates, Boards tabs | Show/hide only (`showRoadmap/showIdeas/showUpdates`) | Rename tabs |
| **General (Internal / Public)**: Title, Summary, Tags, Attachments | Public only: Tags. No title/summary/attachments toggles; attachments never public | Internal column + 3 new keys |
| **Roadmap cards (Internal / Public)**: Votes, Objectives, Card details, Features, Feature details, Feature progress, Dates, Image headers, Completed cards | Public only: votes, objectives, descriptions, features, dates, completed | Internal column; feature progress split out; image headers (cards have no header image yet) |
| **Board's feedback**: feedback public by default (Internal / Public) | Per board: `feedback_boards.autoPublish` | Link only (see R7) |

"Feature details" has no counterpart: our features are a title + done flag. Dropped.

## 2. Decisions to approve

- **R1 Layout.** Large modal (`max-w-4xl`, primary-colour header band, section cards, sticky footer Discard / Save changes). Everything, columns included, is staged and saved in **one transaction** by a new `saveRoadmapSettings` service. Deleting a column that still has cards fails with a clear message (FK is NO ACTION); Discard resets the form. *Recommended.*
- **R2 Internal vs Public display.** New `roadmaps.internal_display` jsonb (same keys as `display`). The dashboard board and drawer respect the internal set; the public site the public set. Keys after this change: `showTitle, showSummary, showTags, showAttachments, showVotes, showObjectives, showDescriptions` ("Card details"), `showFeatures, showFeatureProgress, showDates, showImageHeaders, showCompleted`. Missing keys fall back to defaults (internal: all on; public: as today, attachments off, image headers on). *Recommended.*
- **R3 Rich summaries.** Internal and public summary use `RichTextEditor`; stored as Tiptap JSON + plain text (new `internal_summary_json`, `public_summary_json`; existing text kept as the plain copy, migrated into simple paragraphs). Public summary shows above the public board when `showSummary` is on. *Recommended.*
- **R4 Completion emails.** New `roadmaps.notify_on_complete` (default on). When a card moves into a **Done** column (completedAt set), a debounced, idempotent `card-completed` job emails: followers of ideas linked to the card (verified addresses, suppressions respected, signed unfollow link, reusing the idea-shipped template with "completed" wording) and team members following the card. Each card/address is emailed once (recorded per card). *Recommended.*
- **R5 Card image headers.** New `roadmap_cards.header_image_key` (tenant-prefixed, via `createUpload`), set/removed in the card drawer, shown at the top of the card on the board and public site when `showImageHeaders` is on. *Recommended.* (Alternative: drop the toggle until later.)
- **R6 Workspace-level settings stay workspace-level.** One public site holds several roadmaps, so Logo, comments, follows, embed and tab names live in **Public site settings**, not per roadmap. The Edit roadmap modal shows a "Public site" card with the URL, the Public switch and a link to those settings. Public site settings gain: `showLogo` and tab labels (`tabLabels: { roadmap, ideas, updates }`, max 24 chars, blank = default). *Recommended.*
- **R7 Feedback "public by default".** Already per board (`autoPublish`). The modal links to board settings rather than duplicating it. *Recommended.*

## 3. Steps (each: tests, lint, typecheck, commit)

1. **Schema + service.** Migration 0009 (`internal_display`, summary JSON columns + backfill, `notify_on_complete`, `header_image_key`, `card_completion_emails` record table). Zod schemas (`roadmapSettingsSchema` with staged columns), `saveRoadmapSettings` in one transaction, `invalidatePublic`. Tests: save, column add/rename/reorder/delete, delete with cards fails, another account can't save.
2. **Edit roadmap modal** (R1, R3, R6/R7 links) replacing `roadmap-settings-dialog.tsx`.
3. **Display wiring** (R2): dashboard board + drawer read `internal_display`; public loaders add title/summary, attachments (public card page, images + PDFs), feature progress bar.
4. **Image headers** (R5): drawer upload/remove, card rendering on both sides.
5. **Public site settings** (R6): `showLogo`, tab labels; public header and tabs use them; `invalidateSite`.
6. **Completion emails** (R4): job, template wording, idempotency tests, worker import guard stays green.
7. **e2e + docs**: edit roadmap flow (stage, discard, save, column delete error), internal toggle hides votes on the board, public summary shows; doc "As built", PROGRESS.

Then Phase 5 (Articles / knowledge base): plan doc for approval.

## 4. Done when

- [x] Every LoopedIn setting above is either in the modal or linked from it.
- [x] Internal and public toggles each change only their own side.
- [x] Column and display changes save together or not at all; Discard undoes.
- [x] Completing a card emails followers once, only when the roadmap allows it.
- [x] Checks green (unit, e2e, lint, typecheck, build).

## 5. As built (2026-10-29)

- **Migration `0009_edit_roadmap`:** `roadmaps.internal_display`, `internal_summary_json`, `public_summary_json` (plain-text summaries backfilled as paragraphs), `notify_on_complete`; `roadmap_cards.header_image_key`, `completion_notified_at` (backfilled from `completed_at`, so old completions never email). The plan's separate record table was not needed: the card column claims the email once.
- **Service:** `saveRoadmapSettings` (`roadmaps.ts`) replaces `updateRoadmap` and the per-column create/update/delete (only `moveColumn` stays, for dragging on the board). One transaction; a removed column that still has cards raises `ConflictError` and nothing is saved. Test helper `src/test/roadmap-settings.ts` (`currentSettings`).
- **Modal** (`roadmap-settings-dialog.tsx`): header band in the sidebar brand colour, sections General (title/summary tabs, `RichTextEditor`), Emails, Columns (tiles with Public status, Done, move left/right, Delete, "+ Add column"), Public roadmap (switch, URL with `?board=`, link to Public site settings), General and Roadmap cards Internal/Public matrices, Board's feedback (link), Danger zone; sticky Discard / Save changes. The form unmounts when closed, so it always opens with saved values.
- **Dashboard (internal set):** `board-display.tsx` context; cards hide objective, description, tags, feature progress, votes, dates and header images per toggle; the drawer hides the Features, Attachments and Votes tabs and the vote box; "Completed cards" toggle starts from the setting (`?done=show|hide` overrides); Title off shows "Roadmaps" in the switcher; Summary shows the internal summary above the board.
- **Public (public set):** title (kept for screen readers when hidden), rich summary, feature progress bar separate from the features list, attachments on the card page/drawer (off by default), header images.
- **Header images:** `ImageUploadField` (`src/components/form/image-upload-field.tsx`, shared with the Updates cover); key checked against the workspace's `cardImages` prefix; old file deleted on change and when the card is deleted; copies don't share the file.
- **R4 change:** completion emails go to **team members following the card** (still in the account, verified email). People following linked ideas are not emailed again: completing a card already moves the ideas to a "done" status and they get the status-change email (doc 23 step 6). Runs in the existing debounced `idea-status-sweep` job (`completionSweep`, `card-completion-emails.ts`), template `card-completed`.
- **R6:** Public site settings gain a Header section: Logo switch and Roadmap / Updates / Ideas tab names (max 24 chars, blank = default).
- **Tests:** `roadmaps.test.ts` (settings), `roadmap-display.test.ts`, `card-completion-emails.test.ts`; e2e "edit roadmap: staged columns, discard, internal and public toggles". 191 unit, 26 e2e.
