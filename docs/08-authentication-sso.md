# 08 — End-User Authentication

How your customers identify themselves on public pages and widgets:

| Method | Plan | Notes |
|--------|------|-------|
| Anonymous | all | Anonymous feedback and voting |
| Guest sign-in | Free+ | Name and email |
| Widget identify | — | Pass `name` / `email` in the widget config |
| Social sign-in | Pro+ | For example Google |
| Password protection | Pro+ | Whole public site behind a shared password |
| Single Sign-On (JWT) | Enterprise | See below |
| SAML | Enterprise (assumed) | KB article dated 30 May 2023 |

## JWT SSO flow

1. An unauthenticated user tries to vote, comment, or submit and clicks **Log in**.
2. LoopedIn redirects to your **Login URL** with a `returnURL` parameter.
3. Your site authenticates the user and signs a JWT with **HS256** using the **SSO Key** from LoopedIn settings. The payload must include `email` and `name`.
4. Your site redirects to `${returnURL}?token=${jwt}`.
5. LoopedIn validates the token and the user is logged in.

Setup: copy the SSO key, enter the Login URL, click **Test URL**, then toggle **Enable SSO**.

```js
const jwt = require('jsonwebtoken');
const token = jwt.sign({ email: user.email, name: user.name }, SSO_KEY, { algorithm: 'HS256' });
res.redirect(`${req.query.returnURL}?token=${token}`);
```

For iframes, append `?token=USER_TOKEN` to the iframe src.

The docs say nothing about token expiry, extra claims, or key rotation.
