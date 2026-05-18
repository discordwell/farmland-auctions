# Wyatt Farmland Auctions

Production static Next.js build for `farmauction.discordwell.com`.

## Local Development

```bash
npm install
npm run dev
```

## Production Build

```bash
npm run build
npm run api:build
```

The app exports static files into `out/`.

## Backend

The API is a Fastify service backed by PostgreSQL.

```bash
docker compose up -d db
npm run db:migrate
npm run api:dev
```

Create listings, auctions, bidder approvals, and closing tasks from `/admin`.
The seed command is intentionally a no-op so production deploys do not create public records.

Core API routes:

- `GET /api/health`
- `GET /api/listings`
- `GET /api/auctions`
- `GET /api/auctions/:id`
- `POST /api/auctions/:id/register`
- `POST /api/auctions/:id/bids`
- `GET /api/auctions/:id/events`
- `POST /api/contact-inquiries`
- `GET /api/admin/dashboard`
- `GET /api/admin/listings`
- `POST /api/admin/listings`
- `GET /api/admin/auctions`
- `POST /api/admin/auctions`
- `GET /api/admin/auctions/:auctionId/bidders`
- `POST /api/admin/auctions/:auctionId/close`

Admin console:

```text
/admin
```

Smoke test:

```bash
SMOKE_BASE_URL=http://127.0.0.1:3510 npm run test:smoke
```

Live flow test with cleanup:

```bash
ADMIN_API_KEY=... DATABASE_URL=... SMOKE_BASE_URL=https://farmauction.discordwell.com npm run test:live-flow
```

Optional notification delivery uses SMTP when configured. Without SMTP, notifications are retained in the admin outbox.

```text
OPS_NOTIFY_EMAIL=ops@example.com
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=<smtp-user>
SMTP_PASSWORD=
SMTP_FROM=Wyatt Farmland Auctions <ops@example.com>
```

## Deployment

The deployed Caddy root is:

```text
/opt/farmauction/site
```

The Caddy vhost used on OVH-2 is tracked at:

```text
deploy/Caddyfile.farmauction.discordwell.com
```

The API runs under PM2 as `farmauction-api` from:

```text
/opt/farmauction/app
```

Database backup helper:

```bash
deploy/backup-postgres.sh
```

On OVH-2, run it from cron with `BACKUP_DIR=/opt/farmauction/backups`. The script keeps 14 days of local custom-format PostgreSQL dumps.
