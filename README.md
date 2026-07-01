# GitHub Release Notifier

A Node.js service that lets users subscribe to email notifications for new GitHub repository releases.

## Running locally

```bash
pnpm install
buf generate
cp .env.example .env
# fill in SMTP_*, GITHUB_TOKEN
pnpm start
```

With Docker:

```bash
cp .env.example .env
docker compose up --build
```

Open http://localhost:3000 for the subscription page.

## Running tests

```bash
pnpm test
```

## Environment variables

| Variable                         | Description                                                       | Default                       |
| -------------------------------- | ----------------------------------------------------------------- | ----------------------------- |
| `PORT`                           | HTTP port                                                         | `3000`                        |
| `GRPC_PORT`                      | gRPC port                                                         | `50051`                       |
| `DB_PATH`                        | SQLite file path                                                  | `./data/app.db`               |
| `BASE_URL`                       | Public URL (used in email links)                                  | `http://localhost:3000`       |
| `GITHUB_TOKEN`                   | GitHub PAT — raises rate limit to 5000 req/hr                     | —                             |
| `CRON_SCHEDULE`                  | Scanner schedule                                                  | `*/15 * * * *`                |
| `REDIS_URL`                      | Redis connection URL                                              | `redis://localhost:6379`      |
| `API_KEY`                        | Protects API endpoints via `X-API-Key` header — disabled if empty | —                             |
| `SMTP_HOST`                      | SMTP host                                                         | —                             |
| `SMTP_PORT`                      | SMTP port                                                         | `587`                         |
| `SMTP_SECURE`                    | Use SSL (true for port 465)                                       | `false`                       |
| `SMTP_USER`                      | SMTP username                                                     | —                             |
| `SMTP_PASS`                      | SMTP password                                                     | —                             |
| `SMTP_FROM`                      | Sender address                                                    | `noreply@github-notifier.dev` |
| `SUBSCRIPTION_SERVICE_GRPC_ADDR` | Address for scanner DB connection                                 | `ghchk:50051`                 |

### gRPC

Same operations available on port `50051`. See [`notifier.proto`](packages/proto//notifier/v1/notifier.proto).

```bash
grpcurl -plaintext \
  -d '{"email":"you@example.com","repo":"denoland/deno"}' \
  localhost:50051 notifier.SubscriptionService/Subscribe
```
