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
npm run db:seed
npm run api:dev
```

Core API routes:

- `GET /api/health`
- `GET /api/listings`
- `GET /api/auctions`
- `GET /api/auctions/:id`
- `POST /api/auctions/:id/register`
- `POST /api/auctions/:id/bids`
- `GET /api/auctions/:id/events`
- `POST /api/contact-inquiries`

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
