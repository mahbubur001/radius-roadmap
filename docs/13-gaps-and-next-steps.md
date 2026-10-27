# 13 — Gaps & Next Steps

## Not verified

The **logged-in admin app** at `app.loopedin.io` was not inspected:
- The Chrome browser extension was not connected during research.
- The assistant does not type passwords into third-party production sites. The account owner has to log in themselves, and the assistant can browse after that.

So the following come from public docs only, not from the live UI:
- Exact admin navigation, menu names, and screen layouts.
- The full settings list (roadmap settings modal, public pages settings, widget settings).
- The analytics/dashboard contents and the "AI tools".
- How sentiment analysis, scheduling, and segmentation are configured in the UI.
- How "Ideas" and "Feedback" look after the April 2025 merge.

Some pages also returned errors: `loopedin.io/how-it-works` returned HTTP 525.

## To complete the audit

1. Connect Claude in Chrome. Log in to `app.loopedin.io` yourself in that Chrome window.
2. Ask the assistant to walk through every admin page. It will screenshot and document the sidebar nav, each module's list/detail views, every settings page, the widget builder, and the public pages.
3. Add a `14-admin-ui-walkthrough.md` with screenshots.
