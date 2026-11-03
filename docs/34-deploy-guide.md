# 34 — Deploying Radius Roadmap to production

A step-by-step guide to put the app live on **one AWS EC2 server** (the setup chosen in `docs/14-dev-tools.md` §9): Caddy (HTTPS) → pm2 `web` (Next.js) + pm2 `worker` (BullMQ), with PostgreSQL 16 and Redis 7 on the same server.

The deploy files already in the repo:

| File | What it does |
|------|--------------|
| `ecosystem.config.cjs` | pm2: `web` (`next start -p 3000`) and `worker` (`dist/worker.js`), both read `.env.local` |
| `deploy/Caddyfile` | HTTPS for the app domain + on-demand certificates for customers' own domains |
| `scripts/deploy.sh` | `git pull` → `pnpm install` → `pnpm build` → `pnpm db:migrate` → pm2 reload |
| `.github/workflows/ci.yml` | lint, typecheck, unit tests and build on every push |

Replace these placeholders everywhere below:

| Placeholder | Example | Meaning |
|-------------|---------|---------|
| `app.example.com` | `roadmap.radiusdirectory.com` | The app domain (dashboard + every public site) |
| `domains.app.example.com` | `domains.roadmap.radiusdirectory.com` | Where customers point their own domains (optional) |
| `files.example.com` | `files.radiusdirectory.com` | The R2 bucket's public domain |
| `SERVER_IP` | `13.234.10.20` | The server's Elastic IP |
| `you@example.com` | | Your email (TLS notices, platform admin) |

---

## 0. Before you start (accounts and decisions)

You need:

- **AWS account** (EC2 + SES + an S3 bucket for backups). Region: **Mumbai `ap-south-1`**, where SES is already set up.
- **Domain DNS access** for the app domain.
- **Cloudflare account**: R2 (files) and Turnstile (bot check on votes).
- **GitHub access** to this repository from the server.
- Optional: **Stripe** (billing), **Google Cloud** (Sign in with Google).

Already done (PROGRESS, 2026-11-01/02): SES in Mumbai has **production access**, `radiusdirectory.com` is verified (DKIM OK), `EMAIL_FROM=noreply@radiusdirectory.com`; R2 keys, bucket and CORS for `localhost:3000` exist.

**Recommendation:** use a **separate production R2 bucket** and **separate production secrets** (never reuse the `.env.local` from your Mac).

---

## 1. Create the server (AWS EC2)

1. **EC2 → Launch instance**
   - Name: `radius-roadmap-prod`
   - AMI: **Ubuntu Server 24.04 LTS (x86_64)**
   - Type: **t3.medium (4 GB RAM)** minimum; **t3.large (8 GB)** is more comfortable (the build runs on the server).
   - Key pair: create one (e.g. `radius-prod.pem`) and keep it safe.
   - Storage: **30 GB gp3**.
2. **Security group** (inbound):

   | Port | Source | Why |
   |------|--------|-----|
   | 22 | **your IP only** | SSH |
   | 80 | 0.0.0.0/0, ::/0 | HTTP (certificates + redirect to HTTPS) |
   | 443 | 0.0.0.0/0, ::/0 | HTTPS |

   Do **not** open 3000, 5432 or 6379.
3. **Elastic IP**: EC2 → Elastic IPs → Allocate → Associate it with the instance. This is `SERVER_IP`.
4. **IAM role for the server** (so no AWS keys live on the server):
   - IAM → Roles → Create role → AWS service → EC2.
   - Add an inline policy:

     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         { "Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"], "Resource": "*" },
         { "Effect": "Allow", "Action": ["s3:PutObject", "s3:ListBucket", "s3:GetObject"],
           "Resource": ["arn:aws:s3:::radius-roadmap-backups", "arn:aws:s3:::radius-roadmap-backups/*"] }
       ]
     }
     ```
   - EC2 → the instance → Actions → Security → **Modify IAM role** → pick it.
5. **Backup bucket**: S3 → Create bucket `radius-roadmap-backups` (region ap-south-1, block all public access, versioning on). Add a lifecycle rule to delete objects after 30 days.

---

## 2. DNS

At your DNS provider:

| Type | Name | Value |
|------|------|-------|
| A | `app.example.com` | `SERVER_IP` |
| A | `domains.app.example.com` (only for custom domains) | `SERVER_IP` |

If the domain is on Cloudflare, set these records to **DNS only (grey cloud)** for now. Caddy issues its own certificates, and the app expects `TRUST_CLOUDFLARE=0`.

Check with `dig +short app.example.com`. It must return `SERVER_IP` before step 7.

---

## 3. Prepare the server

SSH in:

```bash
chmod 600 radius-prod.pem
ssh -i radius-prod.pem ubuntu@SERVER_IP
```

### 3.1 Updates, firewall, swap

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install git curl unzip build-essential ufw fail2ban unattended-upgrades
sudo snap install aws-cli --classic                 # for the S3 backups (step 10)
sudo dpkg-reconfigure -plow unattended-upgrades   # choose "Yes"

sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw --force enable

# 2 GB swap: the Next.js build needs headroom on a 4 GB box
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 3.2 Node 22, pnpm, pm2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
sudo corepack enable                       # pnpm comes from package.json "packageManager"
sudo npm install -g pm2
node -v    # v22.x
```

### 3.3 PostgreSQL 16 (localhost only)

Ubuntu 24.04 ships PostgreSQL 16:

```bash
sudo apt -y install postgresql
sudo -u postgres psql <<'SQL'
CREATE USER radius WITH PASSWORD 'CHANGE-ME-long-random-password';
CREATE DATABASE radius_roadmap OWNER radius;
SQL
```

It listens on `localhost` only by default (`listen_addresses = 'localhost'`). Leave it that way.

### 3.4 Redis 7 (BullMQ needs "noeviction")

```bash
sudo apt -y install redis-server
sudo sed -i 's/^#\? *maxmemory-policy .*/maxmemory-policy noeviction/' /etc/redis/redis.conf
grep -q '^maxmemory-policy' /etc/redis/redis.conf || echo 'maxmemory-policy noeviction' | sudo tee -a /etc/redis/redis.conf
sudo sed -i 's/^appendonly no/appendonly yes/' /etc/redis/redis.conf   # keep queued jobs across restarts
sudo systemctl enable --now redis-server && sudo systemctl restart redis-server
redis-cli config get maxmemory-policy     # → noeviction
```

Redis binds to `127.0.0.1` by default. Leave it that way.

### 3.5 Caddy

```bash
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy
```

---

## 4. Get the code

Use a dedicated folder `/srv/radius-roadmap` (the path `ecosystem.config.cjs` expects), owned by `ubuntu`.

1. Create a **deploy key** so the server can read the repo:

   ```bash
   ssh-keygen -t ed25519 -C "radius-prod" -f ~/.ssh/github_deploy -N ""
   cat ~/.ssh/github_deploy.pub
   ```

   GitHub → the repo → Settings → Deploy keys → Add (read-only) → paste.

   ```bash
   cat >> ~/.ssh/config <<'EOF'
   Host github.com
     IdentityFile ~/.ssh/github_deploy
   EOF
   ```

2. Clone:

   ```bash
   sudo mkdir -p /srv/radius-roadmap && sudo chown ubuntu:ubuntu /srv/radius-roadmap
   git clone git@github.com:<owner>/<repo>.git /srv/radius-roadmap
   cd /srv/radius-roadmap
   ```

---

## 5. Production settings (`.env.local`)

Create `/srv/radius-roadmap/.env.local` (never commit it). The web app, the worker, `next build` and `drizzle-kit migrate` all read it.

```bash
cd /srv/radius-roadmap
openssl rand -base64 32   # run 2× : BETTER_AUTH_SECRET and VISITOR_SECRET
nano .env.local
chmod 600 .env.local
```

```dotenv
# --- Database / Redis ---
DATABASE_URL=postgres://radius:CHANGE-ME-long-random-password@localhost:5432/radius_roadmap
REDIS_URL=redis://localhost:6379

# --- App ---
NEXT_PUBLIC_APP_URL=https://app.example.com
BETTER_AUTH_URL=https://app.example.com
BETTER_AUTH_SECRET=<openssl output 1>
VISITOR_SECRET=<openssl output 2>

# --- Email (Amazon SES, Mumbai). No AWS keys: the EC2 role is used. ---
EMAIL_FROM="Radius Roadmap <noreply@radiusdirectory.com>"
AWS_REGION=ap-south-1

# --- Files (Cloudflare R2, production bucket) ---
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=radius-roadmap-prod
R2_PUBLIC_URL=https://files.example.com

# --- Bot check on votes (Cloudflare Turnstile, real keys) ---
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
TRUST_CLOUDFLARE=0

# --- Operator (/admin) ---
PLATFORM_ADMIN_EMAILS=you@example.com

# --- Optional: custom domains ---
CUSTOM_DOMAIN_TARGET=domains.app.example.com

# --- Optional: Stripe billing (empty = billing off, all accounts unlimited) ---
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# --- Optional: Sign in with Google ---
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Rules:
- `NEXT_PUBLIC_*` values are baked in at **build time**. After changing one, rebuild (`./scripts/deploy.sh`), not just restart.
- Don't set `NODE_ENV=production` in the shell: `pnpm install` would then skip the build tools (`tsup`, `vite`, `drizzle-kit`). pm2 sets it for the running apps.
- `VISITOR_SECRET` and `BETTER_AUTH_SECRET` must never change once live (votes and sessions depend on them).

---

## 6. First build and start

```bash
cd /srv/radius-roadmap
chmod +x scripts/deploy.sh
pnpm install --frozen-lockfile
pnpm build              # widget + Next.js + worker (dist/worker.js)
pnpm db:migrate         # creates every table (migrations in drizzle/)
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd     # prints one sudo command: run it, so pm2 starts on boot
pm2 install pm2-logrotate
```

Check:

```bash
pm2 status                       # web + worker "online"
curl -I http://localhost:3000    # 200 or 307
pm2 logs worker --lines 20       # "[worker] started: email, notify, webhooks"
```

---

## 7. HTTPS with Caddy

```bash
sudo cp /srv/radius-roadmap/deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile
```

- Replace `ops@example.com` with your email.
- Replace `app.example.com` with the real app domain.
- **No custom domains yet?** Delete the whole `https:// { … }` block and the `on_demand_tls { … }` block.

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Open **https://app.example.com**. The certificate is issued on first load (allow a few seconds).

---

## 8. Connect the outside services

### 8.1 Amazon SES
- Already in production mode with `radiusdirectory.com` verified. Nothing to do unless `EMAIL_FROM` changes domain.
- Test: sign up on the live site and check the verification email arrives.

### 8.2 Cloudflare R2 (files)
1. R2 → create bucket `radius-roadmap-prod`.
2. Bucket → Settings → **Custom domain** → `files.example.com`. This is `R2_PUBLIC_URL`.
3. Bucket → Settings → **CORS policy**:

   ```json
   [
     {
       "AllowedOrigins": ["https://app.example.com"],
       "AllowedMethods": ["PUT", "GET"],
       "AllowedHeaders": ["content-type", "content-disposition"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. R2 → Manage API tokens → create a token with **Object Read & Write** on that bucket only → `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`.

### 8.3 Cloudflare Turnstile
Turnstile → Add site → domain `app.example.com` (add customer domains later if used), widget mode **Invisible**. Put the two keys in `.env.local`, then run `./scripts/deploy.sh` (the site key is a build-time value).

### 8.4 Stripe (when you're ready to charge)
1. Stripe dashboard (live mode) → Developers → API keys → `STRIPE_SECRET_KEY`.
2. On the server: `pnpm stripe:setup` (creates the products and prices from `src/lib/plans.ts`).
3. Developers → Webhooks → Add endpoint: `https://app.example.com/api/webhooks/stripe`, events:
   `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`, `customer.subscription.resumed`.
   Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
4. Settings → Billing → **Customer portal**: turn on, allow plan switching and cancelling.
5. `pm2 reload ecosystem.config.cjs --update-env`.

### 8.5 Sign in with Google (optional)
Google Cloud → APIs & Services → Credentials → OAuth client (Web):
- Authorized JavaScript origin: `https://app.example.com`
- Redirect URI: `https://app.example.com/api/auth/callback/google`

Put the ID and secret in `.env.local`, then `pm2 reload ecosystem.config.cjs --update-env`.

### 8.6 Customers' own domains (optional, Pro)
1. DNS: `domains.app.example.com` A → `SERVER_IP` (step 2).
2. `.env.local`: `CUSTOM_DOMAIN_TARGET=domains.app.example.com`.
3. Keep the `https://` and `on_demand_tls` blocks in the Caddyfile (step 7).
4. A customer adds their domain in Settings → Domain and creates a CNAME `feedback.customer.com → domains.app.example.com`. The worker checks DNS every 10 minutes; Caddy issues the certificate on the first visit.

---

## 9. Go-live checklist

Work through these on the live site:

- [ ] `https://app.example.com` loads with a valid certificate; `http://` redirects to `https://`.
- [ ] Sign up → verification email arrives (SES) → onboarding creates the account and workspace.
- [ ] Upload a logo in Settings → Branding (R2 + CORS work).
- [ ] Public site `https://app.example.com/<account>/roadmap` opens; vote as a visitor in a private window (Turnstile works).
- [ ] Submit an idea as a guest → the team gets the "New idea" email (worker + SES).
- [ ] Publish an Update → subscribers get it.
- [ ] `/admin` opens for the email in `PLATFORM_ADMIN_EMAILS` and is a 404 for everyone else.
- [ ] `pm2 status` shows both apps online after `sudo reboot`.
- [ ] A backup file appears in S3 after the first nightly run (step 10).
- [ ] (Stripe) Checkout → Pro → cancel works; Stripe shows webhook deliveries as 200.

---

## 10. Backups (nightly, to S3)

```bash
sudo tee /usr/local/bin/rr-backup.sh > /dev/null <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
STAMP=$(date -u +%Y-%m-%dT%H%M)
FILE=/tmp/radius_roadmap-$STAMP.dump
sudo -u postgres pg_dump -Fc radius_roadmap > "$FILE"
aws s3 cp "$FILE" "s3://radius-roadmap-backups/db/$(basename "$FILE")" --region ap-south-1
rm -f "$FILE"
EOF
sudo chmod +x /usr/local/bin/rr-backup.sh
sudo /usr/local/bin/rr-backup.sh            # run once now, check it lands in S3
( sudo crontab -l 2>/dev/null; echo "30 2 * * * /usr/local/bin/rr-backup.sh >> /var/log/rr-backup.log 2>&1" ) | sudo crontab -
```

Files are already backed up by R2 itself; the database is what matters.

**Test a restore** once, into a scratch database:

```bash
aws s3 cp s3://radius-roadmap-backups/db/<file>.dump /tmp/r.dump
sudo -u postgres createdb rr_restore_test
sudo -u postgres pg_restore -d rr_restore_test /tmp/r.dump
sudo -u postgres psql -d rr_restore_test -c "select count(*) from organization;"
sudo -u postgres dropdb rr_restore_test
```

---

## 11. Updating the live site

On your Mac: commit, push to `main`, and wait for **CI to go green**. Then on the server:

```bash
ssh -i radius-prod.pem ubuntu@SERVER_IP
cd /srv/radius-roadmap && ./scripts/deploy.sh
```

`deploy.sh` pulls, installs, builds, **runs new migrations**, and reloads both apps (`pm2 reload`: web restarts without dropping requests; the worker finishes running jobs first, `kill_timeout` 30 s).

**Rolling back** a bad release:

```bash
cd /srv/radius-roadmap
git log --oneline -5
git checkout <good-commit>
pnpm install --frozen-lockfile && pnpm build && pm2 reload ecosystem.config.cjs --update-env
git checkout main        # once the fix is pushed, deploy normally again
```

Most migrations only add tables or columns, so the older code usually runs fine on the newer database. Check the release's new files in `drizzle/` before rolling back. If a migration itself is the problem, restore the last backup (step 10); never edit an applied migration.

**Optional: deploy from GitHub automatically.** CI does not deploy yet (`docs/14-dev-tools.md` plans "deploy to EC2 over SSH"). When wanted, add a `deploy` job after `ci` that SSHes in and runs `./scripts/deploy.sh` (secrets: host, user, private key). It changes CI/CD, so agree it first.

---

## 12. Logs, monitoring, troubleshooting

```bash
pm2 status
pm2 logs web --lines 100
pm2 logs worker --lines 100
sudo journalctl -u caddy -n 100 --no-pager
sudo -u postgres psql -d radius_roadmap -c "select now();"
redis-cli ping
```

Free uptime check: UptimeRobot (or similar) on `https://app.example.com` every 5 minutes, with an email alert.

| Symptom | Likely cause → fix |
|---------|--------------------|
| Site shows 502 | `web` is down → `pm2 logs web`; often a missing or invalid env var (the app validates them at start) |
| Emails never arrive | `pm2 logs worker`; check the EC2 IAM role has `ses:SendRawEmail`, and `EMAIL_FROM` is a verified SES identity |
| Uploads fail with a CORS error | the R2 CORS rule must list `https://app.example.com` exactly |
| Votes fail "verification" | Turnstile keys wrong or domain not added in Turnstile |
| Certificate errors | DNS doesn't point at `SERVER_IP` yet, or port 80/443 closed |
| Build killed (out of memory) | add the swap (3.1) or use t3.large |
| Jobs lost after a Redis restart | `appendonly yes` and `maxmemory-policy noeviction` (3.4) |
| Changed a `NEXT_PUBLIC_*` value, no effect | it's baked in at build: run `./scripts/deploy.sh` |

---

## 13. Security notes

- SSH: key only, port 22 open to your IP only; `fail2ban` and unattended upgrades on (3.1).
- Postgres and Redis listen on localhost only; ports 5432/6379/3000 are never opened.
- `.env.local` is `chmod 600` and never committed; production secrets differ from development ones.
- Rotate the R2 token and Stripe keys if a laptop is lost; `BETTER_AUTH_SECRET` and `VISITOR_SECRET` stay fixed (changing them signs everyone out and resets anonymous votes).
- `PLATFORM_ADMIN_EMAILS` should list only your own verified email.

## 14. Rough monthly cost

| Item | Approx. |
|------|---------|
| EC2 t3.medium (on-demand, Mumbai) + 30 GB gp3 + Elastic IP | ≈ US$ 35–40 |
| SES | US$ 0.10 per 1,000 emails |
| S3 backups | < US$ 1 |
| Cloudflare R2 | free up to 10 GB, then US$ 0.015/GB |
| Turnstile, Caddy certificates | free |
