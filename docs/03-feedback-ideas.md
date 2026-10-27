# 03 — Feedback & Ideas

> In April 2025 LoopedIn merged **Ideas into Feedback Boards** (per the API changelog). The KB and API still use both terms. Treat "idea" as an item on a feedback board.

## Feedback boards

- Multiple boards per workspace (plan-limited: 1 / 3 / 5 / unlimited).
- **Public** or **private** (internal or sensitive topics).
- Shown on the public page under the Ideas / Feedback tabs, embeddable via iFrame or widget.

## What end users can do

| Action | Notes |
|--------|-------|
| Submit idea / feedback | Can be anonymous, guest, social sign-in, or SSO-identified |
| Vote | Upvote. Anonymous voting is supported. Webhooks: `vote_added` / `vote_removed` |
| Comment | Startup plan and up |
| Follow | Email notifications on progress |
| Emoji react | Startup plan and up |
| Attach files / video | PDFs, wireframes, hosted video embeds |

## What admins can do

- **Approve new ideas** before they appear publicly (moderation queue).
- **Display ideas as public by default**, or mark individual ideas **private**.
- **Custom categories** with hex colors.
- **Merge** duplicates (keeps votes and followers).
- **Copy / duplicate** items.
- **Archive**, mark **completed**.
- **Convert feedback → idea** (`feedback.converted_to_idea`).
- **Push to Roadmap**: creates a linked roadmap card (`idea.pushed_to_roadmap`), or **add to an existing card** (`idea.added_to_card`).
- **Publish to Jira** as an Epic or Story (see [10](10-integrations-api-webhooks.md)).
- **Sentiment analysis**: feedback is auto-labelled positive, neutral, or negative.
- **Dashboards / analytics** on feedback.
- **CSV export**.
- **AI tools** (marketed, no detail given).

## Prioritization: Effort/Impact matrix

Each idea has two sliders, **Impact** and **Effort**, editable in the Quick Details modal or on the idea page.

- **Priority Score = Impact + Effort**, range **2–10**. Effort appears to be scored inversely, so low effort gives more points.

| Score | Bucket |
|-------|--------|
| 8–10 | Quick Wins |
| 5–7 | Maybe |
| 2–4 | Time Sinks |

The matrix shows four quadrants:

| | Low effort | High effort |
|---|---|---|
| **High impact** | Quick Wins (do first) | Big Bets (keep few) |
| **Low impact** | Incremental (batch them) | Time Sinks (consider stopping) |

## Webhook events

`idea.created|updated|deleted|completed|pushed_to_roadmap|added_to_card|vote_added|vote_removed`
`feedback.created|updated|deleted|completed|converted_to_idea|pushed_to_roadmap|vote_added|vote_removed`
