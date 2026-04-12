# GitHub Release Notifier

A Node.js service that lets users subscribe to email notifications for new GitHub repository releases.

## How it works

1. User subscribes via `POST /api/subscribe` with their email and a GitHub repo (`owner/repo`)
2. Service verifies the repo exists via GitHub API, then sends a confirmation email
3. User confirms via the link in the email (`GET /api/confirm/:token`)
4. A background scanner runs on a cron schedule, checks all confirmed subscriptions for new releases
5. When a new release is detected, an email is sent with an unsubscribe link (`GET /api/unsubscribe/:token`)

## Stack

- **Node.js 20** / **pnpm 9**
- **Express 4** — HTTP API
- **better-sqlite3** — SQLite database, auto-migrated on startup
- **node-cron** — release scanner scheduler
- **Nodemailer** — email delivery
- **axios** — GitHub API client
- **ioredis** — Redis caching
- **prom-client** — Prometheus metrics
- **@grpc/grpc-js** — gRPC server
- **uuid** — confirmation and unsubscribe token generation
- **Jest** — unit tests
- **ESLint** — linting
- **GitHub Actions** — CI

## Project structure

```
├── .github/workflows/ci.yml     # CI: lint + test on every push
├── proto/notifier.proto          # gRPC service definition
├── public/index.html             # HTML subscription page (served at GET /)
├── src/
│   ├── index.js                  # App entry point
│   ├── db/database.js            # SQLite connection + migrations
│   ├── grpc/server.js            # gRPC server (alternative to REST)
│   ├── middleware/
│   │   ├── auth.js               # X-API-Key authentication
│   │   ├── errorHandler.js       # Global Express error handler
│   │   └── validate.js           # Request body validation
│   ├── routes/subscriptions.js   # All 4 REST endpoints
│   └── services/
│       ├── cache.js              # Redis cache (TTL 10 min)
│       ├── github.js             # GitHub API + caching
│       ├── metrics.js            # Prometheus metrics
│       ├── notifier.js           # Confirmation + release emails
│       └── scanner.js            # Cron: polls GitHub for new releases
├── tests/                        # Unit tests
├── swagger.yaml                  # API contract
├── Dockerfile
└── docker-compose.yml            # App + Redis
```

## Running locally

```bash
pnpm install
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

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | HTTP port | `3000` |
| `GRPC_PORT` | gRPC port | `50051` |
| `DB_PATH` | SQLite file path | `./data/app.db` |
| `BASE_URL` | Public URL (used in email links) | `http://localhost:3000` |
| `GITHUB_TOKEN` | GitHub PAT — raises rate limit to 5000 req/hr | — |
| `CRON_SCHEDULE` | Scanner schedule | `*/15 * * * *` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `API_KEY` | Protects API endpoints via `X-API-Key` header — disabled if empty | — |
| `SMTP_HOST` | SMTP host | — |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_SECURE` | Use SSL (true for port 465) | `false` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |
| `SMTP_FROM` | Sender address | `noreply@github-notifier.dev` |

## API

Full contract: [`swagger.yaml`](./swagger.yaml) — paste into https://editor.swagger.io/

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/subscribe` | API key | Subscribe (sends confirmation email) |
| `GET` | `/api/confirm/:token` | — | Confirm subscription |
| `GET` | `/api/unsubscribe/:token` | — | Unsubscribe |
| `GET` | `/api/subscriptions?email=` | API key | List subscriptions for email |
| `GET` | `/health` | — | Health check |
| `GET` | `/metrics` | — | Prometheus metrics |

### gRPC

Same operations available on port `50051`. See [`proto/notifier.proto`](./proto/notifier.proto).

```bash
grpcurl -plaintext \
  -d '{"email":"you@example.com","repo":"denoland/deno"}' \
  localhost:50051 notifier.SubscriptionService/Subscribe
```
