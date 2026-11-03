# 33 — More team email alerts (votes, review reminder, weekly, replies)

Status: **APPROVED + BUILT 2026-11-03** (owner: "go for all point one by one", after the five recommendations below).

Scope: the team's own alerts in **Settings → Notifications** (per member, per workspace). Voter / subscriber emails don't change.

## 1. Today

Per member and workspace: New ideas, New comments, New subscribers, each Right away / Daily digest / Off. No row = role default (owners and admins: right away; members: off; subscribers: off). One daily digest at 08:00 UTC.

## 2. What we add

| # | Alert | Options | Default (owner/admin · member) |
|---|-------|---------|-------------------------------|
| 1 | **Votes**: "Right away" = a *milestone* email when a card or idea reaches 10 / 25 / 50 / 100 / 250 / 500 / 1000 votes (never one email per vote) | Right away · Daily · Weekly · Off | Right away · Off |
| 2 | **Votes in the digest**: "Daily" / "Weekly" = a votes section in the digest: total new votes, the top 5 items, milestones reached | (same setting as 1) | |
| 3 | **Ideas waiting for review**: ideas still in the inbox after 24 hours, oldest first (up to 10 listed + the count) | Daily · Weekly · Off | Daily · Off |
| 4 | **Weekly**: every alert can also be *Weekly* (a weekly digest, Monday 08:00 UTC, last 7 days) | adds "Weekly" to every row | |
| 4b | **Weekly summary**: new ideas, new votes, new comments, new subscribers, top 5 items by new votes, cards completed, posts published, for the last 7 days | On · Off | On · Off |
| 5 | **Replies to you**: someone else comments (public comment or team note) on an idea or card where you commented before | Right away · Daily · Weekly · Off | Right away · Right away |

## 3. Decisions

1. New columns on `notification_preferences` are **nullable**: null = the role default, so members who saved settings before keep sensible defaults for the new rows.
2. The frequency enum gains `weekly`. Rows only offer the options that make sense (no "Right away" for the review reminder; the summary is On/Off).
3. Milestones are recorded in a new table `vote_milestones` (subject + milestone, unique). The email goes out only when that row is inserted, so voting, unvoting and voting again at 25 never sends twice. Imported votes count toward the total but an import itself never triggers a milestone (only a visitor's vote does).
4. One digest per member, workspace and period: everything set to Daily lands in one email, everything set to Weekly in one weekly email. The review reminder and the weekly summary are sections of those digests, not separate emails.
5. Replies: when a member would get both a "new comment" and a "reply to you" email for the same comment, they get only the reply email (it says more).
6. All of it runs in the worker; email job ids include the event, period and recipient, so retries never send twice. Suspended accounts send nothing (as today).
7. Tests: each new service is scoped by the item's own account and workspace, with a test that another account's activity never shows up.

## 4. Steps (each: build, tests, commit)

1. Schema + migration (enum `weekly`, columns `votes`, `review_reminder`, `replies`, `weekly_summary`, table `vote_milestones`), Zod schema, settings page rows.
2. Vote milestones (instant): detection after a vote, `vote-milestone` job, email template.
3. Digest rework: daily + weekly periods, votes section, review reminder section, weekly summary section; weekly scheduler.
4. Replies to you (instant + digest sections), de-duplicated with new-comment emails.
5. Docs (this file "As built", PROGRESS), e2e check of the settings page.

## 5. As built

| Step | Commit | Notes |
|------|--------|-------|
| 1 Settings | e6e7704 | Migration `0019_email_alerts`. `ALERT_OPTIONS` in `src/lib/schemas/notifications.ts` lists each alert's options; `withDefaults()` fills null columns with the role default. |
| 2 Vote milestones | 5aa099e | `toggleVote` / `toggleFeedbackVote` queue `vote-milestone` when a vote brings the total to a milestone; `voteMilestoneEmails()` records it in `vote_milestones` first. |
| 3 Digests | 6f077bf | `src/server/services/digests.ts` (`digestEmails(db, since, period)`), template `feedback-digest` with all sections, scheduler `weekly-digest` in `worker.ts`. Iterates every workspace, because owners and admins get the reminder and summary without saved settings. |
| 4 Replies | 66e1a3a | `newCommentEmails()` marks members who commented before as `reply` (when Replies = Right away); the email says "replied". |
| 5 Docs + e2e | this commit | `e2e/notifications.spec.ts`. |
