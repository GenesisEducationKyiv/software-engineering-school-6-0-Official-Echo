# Task Completion

## Requirements

### Core (mandatory)

**1. API matches Swagger contract**
All endpoints, HTTP status codes, and response shapes match `swagger.yaml` exactly:

- `POST /api/subscribe` → 200 / 400 / 404 / 409
- `GET /api/confirm/:token` → 200 / 400 / 404
- `GET /api/unsubscribe/:token` → 200 / 400 / 404
- `GET /api/subscriptions?email=` → 200 / 400 (returns array of `Subscription` objects)

**2. Monolith**
Single Node.js process runs HTTP API, gRPC server, background scanner, and email notifier.

**3. Database + migrations**
SQLite via `better-sqlite3`. `runMigrations()` runs on startup using `CREATE TABLE IF NOT EXISTS` — idempotent, safe to run repeatedly.

**4. Dockerfile + docker-compose**
`docker compose up --build` starts the full system: app + Redis. SQLite data persisted via named Docker volume.

**5. Scanner + last_seen_tag**
`node-cron` runs `scanAllRepos()` on a configurable schedule (default: every 15 minutes). `last_seen_tag` is stored per subscription (not per repo), so each subscriber is tracked independently. First scan after confirmation stores the current tag without sending a notification — only subsequent tag changes trigger emails.

**6. GitHub repo validation**
On subscribe: format validated with regex before hitting the API (`owner/repo` pattern). Returns 400 on bad format, 404 if GitHub returns 404.

**7. GitHub 429 handling**
`repoExists()` and `getLatestRelease()` both detect 429 responses and throw a structured error with `retryAfter`. The REST API surfaces this as a 429 response. The scanner breaks out of its current scan loop and waits for the next cron tick.

**8. Thin framework**
Express 4. No Nest.js or other high-level frameworks.

**9. Unit tests**
35 tests across 5 suites:

- `github.test.js` — format validation, repoExists, getLatestRelease (200/404/429)
- `scanner.test.js` — first check, unchanged tag, new release, partial email failure
- `validate.test.js` — required fields, email format
- `auth.test.js` — disabled auth, missing key, wrong key, correct key
- `cache.test.js` — get/set/del round-trip, graceful degradation when Redis is down

---

### Extra

**HTML subscription page**\
`public/index.html` served at `GET /`. GitHub-styled form, shows subscription status (confirmed / pending) by querying `/api/subscriptions`.

**gRPC interface**\
Full alternative to REST. Defined in `proto/notifier.proto`, implemented in `src/grpc/server.js`. Exposes all 4 operations: `Subscribe`, `Confirm`, `Unsubscribe`, `GetSubscriptions`.

**Redis caching**\
`src/services/cache.js` wraps `ioredis`. GitHub API responses cached with TTL 10 minutes (`repo:exists:*` and `repo:release:*` keys). If Redis is unreachable the service continues without caching — no crash, no thrown errors.

**API key authentication**\
`src/middleware/auth.js` checks the `X-API-Key` header on all `/api/*` routes except `/confirm/:token` and `/unsubscribe/:token` (those are token-authenticated by design). Auth is disabled entirely when `API_KEY` env var is not set.

**Prometheus metrics**\
`GET /metrics` (no auth — intended for infra scraping). Provided by `prom-client`:

- `http_requests_total` — by method / route / status
- `http_request_duration_seconds` — histogram with buckets
- `subscriptions_total`, `confirmed_subscriptions_total`
- `notifications_sent_total`, `scanner_runs_total`
- Default Node.js metrics (heap, CPU, GC, event loop lag)

**GitHub Actions CI**\
`.github/workflows/ci.yml` runs on every push and pull request to `main`. Steps: checkout → Node 20 → pnpm 9 → install → lint → test.

**Hosting** — not completed. The service runs correctly on a GCP Compute Engine VM via `docker compose`, but without a domain or HTTPS termination.
