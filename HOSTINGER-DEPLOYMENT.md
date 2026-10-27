# Deploying to Hostinger (Node.js Web App, from GitHub)

One Node.js app serves both the React frontend and the Express API on the same domain.
The Supabase database is hosted separately and only needs its migrations applied.

---

## 1. Before the first deploy

1. **Run the database migrations** in Supabase → SQL Editor, in this order (each is safe to re-run):
   `smtp_settings_migration.sql`, `campaigns_migration.sql`, `email_templates_migration.sql`,
   `scheduled_campaigns_migration.sql`, `analytics_and_audiences_migration.sql`,
   `whatsapp_migration.sql`, `reliability_migration_2026_10.sql` (all in `supabase/`).
2. **Build locally once** to catch errors early: `npm run build`.
   `apps/server/dist/public/index.html` must exist afterwards.
3. **Check what's in git.** `.env` files, `*.zip` and the old docs that contain credentials are
   gitignored and must never be pushed.

## 2. Create the app in hPanel

hPanel → **Websites → Add website → Node.js Apps → Import Git repository**, then pick
`mamotechnolabsll/Bulk-email-software`, branch `main`.

| Field | Value |
| --- | --- |
| Framework preset | Express (or "Other") |
| Node.js version | **22.x** (20.x minimum) |
| Root directory | `./` (repo root, leave the default) |
| Package manager | `npm` |
| Build command | `npm run build` |
| Output directory | leave empty / repo root. **Not** `apps/server/dist`: dependencies live in the root `node_modules` |
| Entry file | `server.js` |

`server.js` at the repo root just starts `apps/server/dist/apps/server/src/index.js`.

## 3. Environment variables

Add these in the app's **Environment variables** section **before** the first build.
The `VITE_*` values are baked into the frontend at build time. If they are missing, the site
loads as a blank page with "Missing VITE_SUPABASE_URL" in the browser console.

```bash
# Runtime
NODE_ENV=production
CLIENT_URL=https://bulkflow.in          # single origin, no trailing slash (used in email links + CORS)
SERVER_URL=https://bulkflow.in          # used for tracking links and WhatsApp callbacks
# PORT — leave unset; Hostinger provides it. Set PORT=5000 only if the app fails to start.

# Frontend (build time)
VITE_API_URL=                           # empty = same domain
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>

# Supabase (server) — Dashboard → Project Settings → API
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # secret, bypasses RLS
SUPABASE_JWT_SECRET=<JWT secret>

# SMTP default (users can also add their own in Settings)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=<mailbox>
SMTP_PASS=<app password>
EMAIL_FROM=<same mailbox or a verified alias of SMTP_USER>

# Security / misc
CRON_SECRET=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
LOG_LEVEL=info
ENABLE_SWAGGER=false

# Optional: AI + WhatsApp (see WHATSAPP-SETUP-GUIDE.md)
GEMINI_API_KEY=
OPENAI_API_KEY=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_WABA_ID=
WHATSAPP_GRAPH_API_VERSION=v23.0
WHATSAPP_WEBHOOK_VERIFY_TOKEN=<random string>
WHATSAPP_APP_SECRET=<Meta app secret>
```

If you change a `VITE_*` variable later, **redeploy** so the frontend is rebuilt.
Restarting is not enough.

## 4. Domain and SSL

- Connect `bulkflow.in` to the app in hPanel and enable the free SSL certificate.
- Redirect `www.bulkflow.in` → `bulkflow.in` (or use www everywhere). The domain users visit
  must match `CLIENT_URL` exactly, otherwise API calls fail CORS.
- Supabase → Authentication → URL Configuration: set **Site URL** to `https://bulkflow.in` and
  add `https://bulkflow.in/**` to Redirect URLs (password reset / email verification).

## 5. Scheduled campaigns (cron)

In production the server does **not** run its own scheduler. Something must call it every minute:

- **cron-job.org** (recommended, see `apps/server/CRON-JOB-ORG-SETUP.md`):
  `POST https://bulkflow.in/api/v1/cron/process`, header `X-Cron-Secret: <CRON_SECRET>`, every 1 minute.

Without this, "Schedule for later" campaigns never send. Immediate sends work without cron.

## 6. Verify

| Check | Expected |
| --- | --- |
| `https://bulkflow.in/` and `/login` | The React app |
| `https://bulkflow.in/health` | `{"success":true,"data":{"status":"ok",...}}` |
| `https://bulkflow.in/health/ready` | `"database":"ok"`. `degraded` means wrong Supabase vars |
| App logs at startup | `Static file serving enabled` and `Server listening on port …` |

## 7. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Build fails | Open the build log. Run `npm run build` locally; it should fail the same way. |
| `Route not found: GET /` | React build not found. The startup log `Static middleware paths initialized` lists the paths tried; the output directory must be the repo root. |
| Blank page, console says missing `VITE_SUPABASE_URL` | Add the `VITE_*` vars, then redeploy. |
| App crashes on start with an env error | A required server variable is missing (`SUPABASE_*`). |
| `Cannot find package '@saas/shared'` | Output directory was set to `apps/server` or `apps/server/dist`. Set it to the repo root. |
| Login works locally but not live | `CLIENT_URL` doesn't match the domain users visit, or Supabase Site URL is wrong. |
| Gmail rejects sending | Use an App Password; `EMAIL_FROM` must equal `SMTP_USER` or a verified alias. |

## Updating

Push to `main`. Hostinger rebuilds and restarts automatically (or click **Redeploy**).
Run any new `supabase/*.sql` migration **before** pushing code that depends on it.
