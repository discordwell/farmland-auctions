# Email setup — Resend (free tier)

The platform fires emails for:

- **Bidder registration confirmation** (to the bidder)
- **Admin decision** (approved / rejected — to the bidder)
- **Outbid notice** (to the previous high bidder; 60s throttled)
- **Auction won / lost** (to all approved participants when an auction closes)
- **Ops notifications** (to `OPS_NOTIFY_EMAIL` for every above event)

All sends go through nodemailer → SMTP. The notification outbox lives in
`notification_outbox`; an in-process `setInterval(30s)` worker
(`server/notificationWorker.ts`) drains `queued`/`failed` rows with
exponential backoff capped at 30 min, max 5 attempts.

## One-time Resend setup

1. Sign up at <https://resend.com>. Free tier is 3,000 emails / month — ~10×
   what Cameron's volume needs.
2. Add `farmauction.discordwell.com` as a domain.
3. Add the SPF + DKIM CNAMEs Resend gives you to the discordwell.com DNS zone
   (it's a Cloudflare zone). Wait for verification.
4. Create an API key — full access. Keep it secret.

## Wire to production

SSH to ovh2, edit `/opt/farmauction/app/.env`:

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=resend
SMTP_PASSWORD=<the Resend API key>
SMTP_FROM=Wyatt Farmland Auctions <auctions@farmauction.discordwell.com>
OPS_NOTIFY_EMAIL=cameron@wyattrealty.ca
```

Then restart the API:

```bash
ssh ovh2 'pm2 restart farmauction-api'
```

The worker runs immediately on boot, then every 30 seconds.

## Test deliverability

```bash
# Score the sending domain. Aim for >= 9/10.
# Send to the test@mail-tester.com address it generates, then refresh.
curl -sS -X POST https://farmauction.discordwell.com/api/contact-inquiries \
  -H 'content-type: application/json' \
  -d '{"name":"deliverability","email":"YOUR-mail-tester-address","fileType":"Auction","message":"smoke"}'
```

Or fire a bidder confirmation via the live form: register for any open auction.
The bidder receives the confirmation directly; `OPS_NOTIFY_EMAIL` receives an
internal copy.

## Inspect the outbox

```bash
ssh ovh2 "docker exec farmauction-postgres psql -U farmauction -d farmauction -c \
  \"SELECT event_type, recipient_email, status, attempts, last_error, created_at \
    FROM notification_outbox ORDER BY created_at DESC LIMIT 25;\""
```

## Force a retry of failed rows

The worker retries automatically when `next_attempt_at <= now()`. To force
an immediate retry:

```bash
ssh ovh2 "docker exec farmauction-postgres psql -U farmauction -d farmauction -c \
  \"UPDATE notification_outbox SET next_attempt_at = now() WHERE status = 'failed' AND attempts < 5;\""
```

## Failure modes

| Symptom | Cause | Fix |
| --- | --- | --- |
| Rows stuck in `queued` | `SMTP_HOST` or `SMTP_FROM` empty in `.env` | set both, restart API |
| Rows in `failed` with auth errors | wrong `SMTP_PASSWORD` | rotate the Resend API key, update `.env` |
| Bounce / domain unverified | DKIM/SPF records missing or unpropagated | check Resend dashboard, wait for DNS |
| Outbid storms in fast auctions | duplicate sends to the same bidder | already throttled to one outbid per bidder per auction per 60 seconds |
| `attempts >= 5` rows | gave up after 5 backoff attempts | inspect `last_error`, fix the cause, then `UPDATE … SET attempts = 0, status = 'queued', next_attempt_at = now()` |

## Local development

Leave `SMTP_HOST` empty in `.env` for dev. Notifications are written to the
outbox in `queued` state and never actually sent. The worker checks `smtpReady()`
before draining, so it's a no-op when SMTP isn't configured. The full flow
(registration → outbox row) can still be verified locally.
