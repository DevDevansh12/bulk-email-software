# WhatsApp Cloud API Setup Guide

How to connect this app to the Meta WhatsApp Cloud API, verify the connection, send a first
template message, and receive delivery/read receipts.

> Meta changes its dashboards and limits regularly. Menu names below were accurate when this
> guide was written; if something has moved, search Meta's docs for the same term.

---

## 0. Apply the database migration

Run `supabase/reliability_migration_2026_10.sql` in the Supabase SQL Editor (after the earlier
migrations). It adds the verification, template-sync, simulation and webhook columns the
WhatsApp features rely on. Without it, saving credentials, syncing templates, and sending fail
with a "apply the latest database migration" error.

---

## 1. Create a Meta app with WhatsApp

1. Go to **https://developers.facebook.com/apps** → **Create App** → type **Business**.
2. On the app dashboard, add the **WhatsApp** product (**Set up**).
3. Open **WhatsApp → API Setup**. Note:
   - **Phone number ID** — a long number such as `109876543210985`. This is *not* the phone number itself.
   - **WhatsApp Business Account ID (WABA ID)** — needed to sync templates.
4. With Meta's free **test number** you can only message recipients you add under **To → Manage phone
   number list** (each one confirms a code on WhatsApp). Messages to other numbers fail with error `131030`.

## 2. Create a permanent access token

The "temporary access token" on the API Setup page expires after about 24 hours — campaigns will
start failing with error `190` the next day. For real use, create a System User token:

1. **https://business.facebook.com/settings/** → **Users → System users → Add** (role: Admin).
2. **Assign assets** → your app (full control) **and** your WhatsApp account.
3. **Generate new token** → select the app → permissions:
   - `whatsapp_business_messaging` (send messages)
   - `whatsapp_business_management` (read templates / account — needed for template sync)
4. Copy the token. Treat it like a password: never commit it, paste it in chat, or log it.

## 3. Enter the credentials

**Per user (recommended):** in the app, **Settings → WhatsApp Config**, enter Phone Number ID,
WABA ID and the token, then **Save**. The badge shows **Saved · not verified**.

Click **Test Connection**. The server calls `GET /{phone-number-id}` on the Graph API (read-only, no
message is sent). On success the badge changes to **Verified with Meta** and shows the sending number
and display name. Saving different credentials resets this to "not verified".

**System default (optional):** set in `apps/server/.env` — used for users without their own config:

```env
WHATSAPP_PHONE_NUMBER_ID=109876543210985
WHATSAPP_ACCESS_TOKEN=<permanent system user token>
WHATSAPP_WABA_ID=101234567890123
WHATSAPP_GRAPH_API_VERSION=v23.0
```

`WHATSAPP_GRAPH_API_VERSION` controls the Graph API version for every call. Meta retires versions
about two years after release; bump it when Meta announces a deprecation.

## 4. Sync templates from Meta

Business-initiated WhatsApp messages (anyone who hasn't messaged you in the last 24 hours) **must**
use a template that Meta has approved.

1. Create templates in **WhatsApp Manager → Message templates** (variables are written `{{1}}`, `{{2}}`, …
   or as named parameters). Wait for status **Approved**.
2. In the app: **WhatsApp → Templates → Sync from Meta**. Templates show their real Meta status
   (Approved / Pending / Rejected / Paused…). Templates deleted in Meta are marked `DELETED`.
3. "New local draft" only saves wording inside this app. Drafts are labeled **Local draft · not approved**
   and cannot be sent.

Supported: templates whose variables are in the **body** (positional or named), with optional static
text header, footer, quick-reply / phone / static-URL buttons. Templates with media headers, header
variables, dynamic URL buttons, copy-code/OTP/flow buttons or carousels are flagged as unsupported.

New test accounts usually include Meta's sample template `hello_world` (`en_US`, no variables) — a good
first test.

## 5. Send a first campaign

1. **WhatsApp → New WhatsApp Campaign**.
2. Upload a CSV/Excel file with a `phone` column. International format (`+14155550123`) is safest.
   Numbers without a country code are rejected unless you set a **default country code**.
   The preview shows, per row, the normalized number that will be used, invalid rows, and duplicates
   (the same number after normalization is sent only once).
3. Choose **Approved template**, pick the template, and map each variable to a CSV column. The server
   re-validates every row with the mapping (missing values, new lines/tabs, etc.).
4. Review and **Start Dispatch**. Progress streams live. The server re-reads and re-validates the
   uploaded file itself — the browser preview is never trusted.

Outcomes:

| Shown | Meaning |
|---|---|
| All messages accepted by Meta | Meta returned a message id for every recipient |
| Finished with some rejections | Some were rejected — each row shows Meta's reason |
| All messages were rejected | Nothing was accepted; see reasons |
| Progress stream interrupted | The browser lost the stream. Sending continues on the server — open the campaign page |

"Accepted" is not "delivered". Delivered/read need the webhook (next step).

**Free-form text** is available as an explicit option, but Meta only delivers it inside a 24-hour
customer-service window (the recipient messaged you recently). Everyone else fails with `131047`.

## 6. Configure the webhook (delivered / read / failed receipts)

1. Pick a random verify token and set both on the server, then restart:

   ```env
   WHATSAPP_WEBHOOK_VERIFY_TOKEN=<random string you choose>
   WHATSAPP_APP_SECRET=<Meta App Dashboard → App settings → Basic → App secret>
   ```

2. Meta App Dashboard → **WhatsApp → Configuration → Webhook → Edit**:
   - **Callback URL:** `https://<your-domain>/api/v1/whatsapp/webhook` (must be public HTTPS)
   - **Verify token:** the same `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
3. Under **Webhook fields**, subscribe to **messages**.

Security:
- There is no default verify token; verification is refused until you set one.
- Every POST must carry a valid `X-Hub-Signature-256` (HMAC-SHA256 of the raw body with the App
  Secret). Without `WHATSAPP_APP_SECRET`, webhook POSTs are **rejected in production** and accepted
  with a warning only in development.

Status handling is idempotent: statuses only move forward (sent → delivered → read), duplicate or
out-of-order callbacks are ignored, failures store Meta's error code and details, and campaign
counters are recounted from recipient rows (so replays can't inflate delivered/read numbers).
Read receipts only arrive for recipients who have read receipts enabled, so read counts are a floor.

## 7. Development simulation (optional)

With `WHATSAPP_SIMULATION_MODE=true` **and** `NODE_ENV` other than `production`, a user with no
credentials (and no system credentials) can run the flow end to end. Such campaigns are stored as
simulations: recipients get status `simulated`, nothing is sent, and they are excluded from every
sent/delivered/read metric. The UI labels them **Simulation**. In production the flag is ignored and
an unconfigured account gets "WhatsApp is not configured".

---

## Troubleshooting

| Symptom / Meta code | Cause | Fix |
|---|---|---|
| `190` | Token expired/invalid (often the 24-hour temporary token) | Create a System User token (step 2), save, Test Connection |
| `10`, `200` | Token lacks permission or isn't assigned to the WABA | Add both permissions; assign the WhatsApp account to the system user |
| `100` (subcode 33) | Wrong Phone Number ID / WABA ID, or no access | Copy IDs again from API Setup |
| `131030` | Recipient not in the test number's allowed list | Add the number under API Setup → To |
| `131047` | Free-form text outside the 24-hour window | Send an approved template |
| `131026` | Undeliverable (not on WhatsApp, old app, terms not accepted) | Verify the number; nothing to retry |
| `131049` | Meta limited marketing messages to this user | Retry much later, not immediately |
| `131050` | Recipient stopped marketing messages | Remove from marketing lists |
| `132000` / `132012` | Template parameter count/format mismatch | Sync templates; check the variable mapping |
| `132001` | Template/language not found or not approved | Sync templates; confirm language code |
| `130429`, `131056` | Rate limits | Retried automatically with backoff; slow down if persistent |
| `133010` | Number not registered with Cloud API | Finish registration in WhatsApp Manager |
| Accepted but never "Delivered" | Webhook not configured or failing signature | Step 6; check server logs for "invalid X-Hub-Signature-256" |
| Webhook verification fails in Meta | Verify token not set or mismatched | Set `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, restart, retry |
| "Delivery status unknown" | Network error reaching Meta mid-request | The message may or may not have been sent — check the recipient before resending |

Server logs never contain the access token or App Secret; they include the campaign id,
recipient id and Meta error code for each failure.

---

**Reference:** https://developers.facebook.com/docs/whatsapp/cloud-api

**Last Updated**: October 26, 2026
