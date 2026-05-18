# Testing

This project has three independent test suites. Each can be run in isolation or all together with a single command.

## Prerequisites

| Tool             | Version    | Required for                |
| ---------------- | ---------- | --------------------------- |
| Node.js          | ≥ 20       | Unit & Integration          |
| pnpm             | ≥ 9        | All local runs              |
| Docker + Compose | any recent | Integration & E2E in Docker |

Install needed dependencies once:

```bash
pnpm install
```

## Run unit+integration tests

```bash
pnpm test
```

## Run all tests

To run all tests, you need to install a browser for E2E testing:

```bash
pnpm exec playwright install chromium
pnpm test:all
```

For more info on E2E tests refer to the [corresponding section](#e2e-tests).

## Unit tests

```bash
# single run with coverage
pnpm test:unit

# watch mode during development
pnpm test:unit:watch
```

**What is tested:** `subscriptionService`, `scanner`, `validation`, error classes and the HTTP error handler, auth middleware, cache, GitHub service, and the validate helpers.

## Integration tests

Tests every endpoint against a real Express app. GitHub API calls and SMTP are mocked.

### Local run

```bash
pnpm test:integration
```

### Docker run

```bash
docker compose -f docker-compose.integration.yml \
  up --build --abort-on-container-exit --exit-code-from tests
```

Tear down afterwards:

```bash
docker compose -f docker-compose.integration.yml down -v
```

## E2E tests

End-to-end browser tests against the live frontend page (`public/index.html`). The tests use `page.route()` to stub all `/api/*` calls.

### Local run

Install a browser for Playwright for first time:

```bash
pnpm exec playwright install chromium
```

Then run Playwright (it will automatically start the app):

```bash
pnpm test:e2e

# Interactive UI mode
pnpm test:e2e:ui
```

By default Playwright connects to `http://localhost:3000`. Override with:

```bash
E2E_BASE_URL=http://localhost:4000 pnpm test:e2e
```

If you want to delete the browser installed during preparation, remove the `%LOCALAPPDATA%\ms-playwright` or `~/.cache/ms-playwright` local folder, or just run this:

```bash
pnpm exec playwright uninstall chromium
```

### Docker run

```bash
docker compose -f docker-compose.e2e.yml \
  up --build --abort-on-container-exit --exit-code-from e2e
```

Tear down afterwards:

```bash
docker compose -f docker-compose.e2e.yml down -v
```

The HTML report and any failure screenshots/traces are copied out of the container and uploaded as CI artifacts. To view the report locally after a run:

```bash
pnpm exec playwright show-report
```
