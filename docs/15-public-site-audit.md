# 15 — Live Audit: Radius Theme public roadmap (LoopedIn)

Audited: 2026-10-27, in Chrome, without logging in.
Page: https://www.radiustheme.com/classified-listing-roadmaps/
Embedded source: https://app.loopedin.io/classified-listing

> The admin dashboard (back end) is **not audited yet**. It needs the owner to log in in Chrome (see the end of this file).

---

## 1. How it's embedded on radiustheme.com

```html
<iframe class="iframe_roadmaps" src="https://app.loopedin.io/classified-listing"
        width="100%" height="900" frameborder="0" loading="lazy"></iframe>
```

- The iframe is a **fixed 900 px high**, so the board scrolls inside its own box. There's no auto-resize script.
- **The parent page has no text of its own** (`document.body.innerText` is empty apart from the iframe), so Google indexes **nothing** from the roadmap on radiustheme.com.
- No LoopedIn widget script is installed on the page.

## 2. Public site structure

A single-page app with **hash routing**:

| Tab | URL | Status on this account |
|-----|-----|------------------------|
| Roadmap | `/classified-listing` (card: `?card=<id>`) | **Active: 66 cards** |
| Updates | `#/updates` | Empty |
| Ideas | `#/ideas-board` | Empty (submission form works) |
| Article | `#/kb` | Empty |

Header: tab nav on the left; **Sign Up** and **Log in** on the right. Footer: "Powered by LoopedIn" (so this account isn't white-labelled).

## 3. Roadmap tab

- Title: "Classified Listing - public roadmap", with a **search box**.
- **4 columns with counts:** In progress (10), Up next (8), Future (5), Done (43).
- **Card** shows:
  - a category dot and label
  - a **colored left border** matching the category
  - the title and an optional description preview (links are clickable)
  - **↑ vote count** and **💬 comment count**
  - a 💡 icon on some cards, which marks a card created from or linked to an idea
- Categories in use: Revenue Growth (green), Onboarding (blue), User Experience (pink/red), Increase Engagement (purple).
- **Card detail** opens as a right-hand **drawer**, and the URL becomes `?card=<id>` (shareable deep link). It shows:
  - Title + description, ♡ vote count
  - Tabs: **Details** | **Comments**
  - Details: **Category**, **Tags** ("Untagged"). So cards have *tags as well as* a category.

### What the data shows about usage
- 66 cards. Votes range from 1 to **95** (Performance Improvement 95, Bidding/Auction 92, Export/Import 89, Image upload limit 75).
- Comments: **only 1 comment across all 66 cards**.
- Ideas, Updates and Articles: **not used**.

**Conclusion: Radius uses LoopedIn as a voting roadmap. Voting and the public board are the parts that matter. Comments, ideas, changelog and KB are unused today.**

## 4. Updates tab
- Search plus a **Categories** filter with these defaults: *New feature, Improvement, Fix, Maintenance, Announcement, Coming soon*.
- Empty state: "No items found."

## 5. Ideas tab
- Ideas list (empty) on the left, and an **"Add new" form** on the right:
  - Title (required)
  - More details: a rich editor with bold, ordered list (with styles), unordered list (with styles), link and image (optional)
  - Name (required), Email (required)
  - Checkbox: agree to Terms of Service / Privacy Policy
  - **Google reCAPTCHA** (spam protection)
- So **guests can submit with a name and email**, without an account.

## 6. Article (KB) tab
- A centered search box, **Recent articles**, and **Categories**. Both lists say "Nothing published yet."

## 7. End-user auth on the public site
- **Log in** dialog: "Log in to vote, comment and submit requests". Email + password, "Remember for 30 days", Forgot Password, link to Sign up.
- **Sign up** dialog: "Sign up with Google", or a form with *account name*, first name, last name, email and re-enter email.
  - ⚠️ UX problem: asking for an "account name" means the public sign-up creates a **LoopedIn SaaS account**, not a simple voter profile. That's confusing for customers who only want to vote.

## 8. Problems seen in LoopedIn (things we can do better)

| # | Problem | Our approach |
|---|---------|--------------|
| 1 | Hash-routed SPA plus an iframe: **no SEO**, and nothing indexed on radiustheme.com | Server-rendered public pages with real URLs (`/roadmap`, `/roadmap/<slug>`, `/updates/<slug>`), plus an embed option that renders real HTML |
| 2 | Fixed 900 px iframe with an inner scrollbar | An embed script that auto-resizes the iframe, plus a WordPress **shortcode/block** |
| 3 | Public sign-up asks for an "account name" | Voters only need email (magic link), Google, or guest name+email. Never create a SaaS account |
| 4 | Comments almost unused | Keep them, but make them optional per board and secondary in the UI |
| 5 | "Powered by" can't be removed below Pro | (Our own product, so this is a pricing decision) |

---

## 9. Proposed plan changes (need your approval)

1. **Public pages:** server-rendered with clean URLs and SEO metadata (instead of a hash SPA). Card detail at both `?card=` (drawer) and `/roadmap/<slug>` (shareable, indexable).
2. **Embed:**
   - an auto-resizing iframe script (`embed.js`)
   - **phase 2:** a **WordPress plugin** (shortcode + Gutenberg block) so radiustheme.com and customers' WordPress sites can embed the roadmap with real, indexable HTML
3. **End-user sign-in:** add **magic link (email code)** next to guest, Google and customer SSO. No password for voters. Remember for 30 days.
4. **Spam protection:** add **Cloudflare Turnstile** (or reCAPTCHA) to public idea submission and guest votes.
5. **Data model additions:**
   - card **tags** (many-to-many) as well as one category
   - column **counts**
   - card ↔ idea link flag (the 💡)
   - public roadmap **search**
   - default update categories: New feature, Improvement, Fix, Maintenance, Announcement, Coming soon
6. **MVP order** (follows what Radius actually uses). Changed from: *accounts → feedback → roadmap → updates → public + widget → billing*. Proposed:
   1. Accounts + workspaces
   2. **Roadmap + voting + public roadmap page + embed** (replaces LoopedIn for Radius right away)
   3. Ideas / feedback board (submission form, approve, push to roadmap)
   4. Updates / changelog + email
   5. Knowledge base
   6. Billing + widget
7. **Migration:** a **LoopedIn importer** via **CSV export** (the account is on the Free plan, so no API). It brings in the 66 roadmap cards with their columns, objectives and vote counts, plus the 62 private feedback items. See doc 16.

## 10. Still to do: admin (back-end) audit
Not done. The LoopedIn admin login page is open in Chrome (tab "Login | LoopedIn"). The owner needs to log in there themselves. After that the audit covers:
- the dashboard nav
- each module's admin views
- roadmap and card editing
- ideas moderation
- the update editor and segments
- the KB editor
- public page, widget, SSO, domain, webhook, integration and team settings

The result goes in `docs/16-admin-ui-walkthrough.md`.
