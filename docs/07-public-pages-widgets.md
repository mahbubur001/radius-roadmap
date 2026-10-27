# 07 — Public Pages, Embeds & Widgets

LoopedIn offers three ways to put content in front of users.

## 1. White-labelled public pages

- URL: `app.loopedin.io/<account-slug>` or your custom domain.
- Tabs: **Roadmap, Updates, Ideas, Feedback** (plus the KB). Each tab can be toggled, renamed, and re-ordered.
- Configured at `app.loopedin.io/public-pages`.
- Options: dark mode, multi-language/translations, password protection (Pro), hide header, show completed cards, custom colors.
- Standalone pages, for example a changelog-only page.

## 2. iFrame embeds

- Copy the embed code or a direct link from Public Pages settings.
- To make the iframe full height, see the KB article on that.
- To sign users in inside an iframe, append `?token=<SSO_JWT>` to the iframe URL.

## 3. JavaScript widgets (`app.loopedin.io/embed`)

Two types: **Sidebar** (slide-out panel) and **Popover**. Both show the latest Update posts.

Widget settings:
- Colors for the launcher icon and slide-out header.
- Launcher icon: the default is a bell; you can replace it with your logo.
- Show or hide the logo.
- Display emoji reactions.
- Enable feedback on posts.
- Custom selector: open the widget from any HTML element instead of the bell.

### Config

```js
var li_sidebar = {
  workspace_id: "123456789",   // required
  auto_init: true,              // default true; if false call LoopedIn.sidebar.init()
  name: "Alex Smith",           // optional, identifies user for feedback/reactions
  email: "alex@example.com",    // optional
  segment: {                    // optional, Enterprise segmentation, string values only
    plan: "pro",
    onboarded: "true"
  }
};
```

### JS API

| Method | Action |
|--------|--------|
| `LoopedIn.sidebar.init()` | Initialize (when `auto_init: false`) |
| `LoopedIn.sidebar.show()` | Open |
| `LoopedIn.sidebar.hide()` | Close |
| `LoopedIn.sidebar.toggle()` | Toggle |

### Widget KB topics

- React / single-page app installation
- Custom selector for the Sidebar and the Popover
- Widget not showing (troubleshooting)
- Sites with a CSP (allowlisting)
- Cloudflare 404 on `/cdn-cgi/challenge-platform/...`
- Works on any platform that allows custom HTML or header scripts (Webflow, ClickUp, WordPress, and others)
