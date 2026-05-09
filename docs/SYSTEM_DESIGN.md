# System Design Document

**_Зміст_**

- [System Design Document](#system-design-document)
    - [1. Вимоги](#1-вимоги)
        - [1.1 Функціональні вимоги](#11-функціональні-вимоги)
        - [1.2 Нефункціональні вимоги](#12-нефункціональні-вимоги)
        - [1.3 Обмеження та припущення](#13-обмеження-та-припущення)
    - [2. Оцінка навантаження](#2-оцінка-навантаження)
        - [2.1 Користувачі та підписки](#21-користувачі-та-підписки)
        - [2.2 Трафік та пропускна здатність](#22-трафік-та-пропускна-здатність)
        - [2.3 Зберігання даних](#23-зберігання-даних)
        - [2.4 Redis](#24-redis)
    - [3. High-level архітектура](#3-high-level-архітектура)
        - [3.1 C4 — Рівень 1: Контекст системи](#31-c4--рівень-1-контекст-системи)
        - [3.2 C4 — Рівень 2: Контейнери](#32-c4--рівень-2-контейнери)
    - [4. Детальний дизайн компонентів](#4-детальний-дизайн-компонентів)
        - [4.1 HTTP API](#41-http-api)
            - [C4 — Рівень 3: Компоненти HTTP API](#c4--рівень-3-компоненти-http-api)
            - [Middleware pipeline](#middleware-pipeline)
            - [Потік підписки (POST /api/subscribe)](#потік-підписки-post-apisubscribe)
        - [4.2 gRPC-сервер](#42-grpc-сервер)
            - [Сервіс `SubscriptionService`](#сервіс-subscriptionservice)
            - [Таблиця gRPC статусів](#таблиця-grpc-статусів)
            - [Порт: `GRPC_PORT` (default: `50051`)](#порт-grpc_port-default-50051)
        - [4.3 Release Scanner](#43-release-scanner)
            - [Алгоритм сканування](#алгоритм-сканування)
        - [4.4 База даних](#44-база-даних)
            - [Стратегія підключення](#стратегія-підключення)
            - [Організація SQL-запитів](#організація-sql-запитів)
        - [4.5 Кеш](#45-кеш)
        - [4.6 GitHub API-клієнт](#46-github-api-клієнт)
            - [Функції](#функції)
            - [Rate limit handling](#rate-limit-handling)
            - [Кешування](#кешування)
            - [Заголовок Authorization](#заголовок-authorization)
        - [4.7 Email-нотифікатор (Nodemailer)](#47-email-нотифікатор-nodemailer)
            - [Функції](#функції-1)
            - [SMTP конфігурація](#smtp-конфігурація)
        - [4.8 Метрики Prometheus](#48-метрики-prometheus)
            - [Зареєстровані метрики](#зареєстровані-метрики)
    - [5. Дизайн бази даних](#5-дизайн-бази-даних)
        - [5.1 ER-діаграма](#51-er-діаграма)
        - [5.2 Індекси та обмеження](#52-індекси-та-обмеження)
        - [5.3 Скінченний автомат підписки](#53-скінченний-автомат-підписки)
        - [5.4 Життєвий цикл підписки](#54-життєвий-цикл-підписки)
    - [6. CI/CD та якість коду](#6-cicd-та-якість-коду)
        - [6.1 GitHub Actions Pipeline](#61-github-actions-pipeline)
        - [6.2 Pre-commit хуки (Lefthook)](#62-pre-commit-хуки-lefthook)

## 1. Вимоги

### 1.1 Функціональні вимоги

| #    | Вимога                                                                                                   |
| ---- | -------------------------------------------------------------------------------------------------------- |
| F-01 | Користувач може підписатися на email-сповіщення про нові релізи будь-якого публічного GitHub-репозиторію |
| F-02 | Після підписки система надсилає підтверджувальний лист з унікальним токеном                              |
| F-03 | Підписка активується лише після переходу за посиланням з листа (`/api/confirm/:token`)                   |
| F-04 | Будь-яка підписка може бути скасована за унікальним посиланням `unsubscribe`                             |
| F-05 | Планувальник перевіряє нові релізи кожні 15 хвилин та надсилає сповіщення                                |
| F-06 | Система дозволяє отримати список підписок за email                                                       |
| F-07 | Система перевіряє існування репозиторію через GitHub API перед збереженням підписки                      |
| F-08 | Усі ті самі операції доступні через gRPC-інтерфейс                                                       |
| F-09 | Метрики Prometheus доступні на `/metrics`                                                                |
| F-10 | Веб-інтерфейс (`public/index.html`) надає форму підписки та список активних підписок                     |

### 1.2 Нефункціональні вимоги

| #     | Вимога                       | Значення                                                                     |
| ----- | ---------------------------- | ---------------------------------------------------------------------------- |
| NF-01 | **Доступність**              | ≥ 99% uptime                                                                 |
| NF-02 | **Затримка відповіді**       | p95 < 500 мс для REST-ендпоінтів                                             |
| NF-03 | **Відтворюваність**          | Збірка відтворювана через `pnpm install --frozen-lockfile`                   |
| NF-04 | **Безпека**                  | API-ендпоінти захищені `X-API-Key`; публічні `/confirm` та `/unsubscribe`    |
| NF-05 | **Спостережуваність**        | HTTP-метрики, кількість підписок, кількість надісланих листів — у Prometheus |
| NF-06 | **Контрактна відповідність** | Усі ендпоінти точно відповідають `swagger.yaml`                              |
| NF-07 | **Ізоляція тестів**          | Unit-тести не мають зовнішніх залежностей; `:memory:` SQLite у CI            |
| NF-08 | **Якість коду**              | ESLint (flat config, v10) + Prettier; pre-commit через Lefthook              |

### 1.3 Обмеження та припущення

- **Єдиний екземпляр:** розгортання — один Node.js-процес; горизонтальне масштабування не передбачено в поточній версії
- **SQLite як БД:** обрано свідомо. Міграція на PostgreSQL — у разі потреби у масштабуванні
- **GitHub Public API:** без авторизації — 60 req/год; з `GITHUB_TOKEN` — 5000 req/год
- **Docker-first:** запуск `docker compose up --build` повністю підіймає сервіс без зовнішніх залежностей
- **Node.js ≥ 20** обов'язковий (нативний ESM, `import.meta.dirname`)

## 2. Оцінка навантаження

### 2.1 Користувачі та підписки

| Метрика                               | Значення        |
| ------------------------------------- | --------------- |
| Очікувана кількість активних підписок | ~1 000 — 10 000 |
| Унікальних репозиторіїв               | ~200 — 2 000    |
| Нових підписок на добу                | ~100            |
| Підтверджень на добу                  | ~80             |

### 2.2 Трафік та пропускна здатність

**REST API:**

- POST /api/subscribe ~10 req/хв
- GET /api/confirm/:t ~8 req/хв
- GET /api/subscriptions ~5 req/хв
- GET /health ~60 req/хв

**Cron Scanner:**

- Кількість репозиторіїв для перевірки: R
- GitHub API запитів за один run: R (один GET /repos/{owner}/{repo}/releases/latest)
- За 1 годину: 4 \* R запитів до GitHub
- Ліміт без токена: 60 req/год → макс. ~15 репозиторіїв
- Ліміт з GITHUB_TOKEN: 5000 req/год → макс. ~1250 репозиторіїв

**Електронна пошта:**

- Нових релізів на добу: ~50
- Середня кількість підписників/repo: ~5
- Email на добу: ~250
- SMTP-запитів на добу: ~250 + ~100 (підтвердження)

### 2.3 Зберігання даних

- Одна підписка в SQLite: ~300 байт
- 10 000 підписок: ~3 МБ
- Ріст за рік (100 нових/д): ~11 МБ

### 2.4 Redis

- TTL ключів: 10 хвилин
- Кеш результатів `getLatestRelease` та `repoExists`
- За відсутності Redis сервіс продовжує роботу

## 3. High-level архітектура

### 3.1 C4 — Рівень 1: Контекст системи

```mermaid
C4Context
    title Контекст системи

    Person(user, "Кінцевий користувач", "Підписується на релізи через веб-форму або gRPC")
    Person(infra, "DevOps", "Зчитує метрики Prometheus")

    System(notifier, "GitHub Release Notifier", "Node.js-сервіс. Керує підписками, сканує релізи GitHub, надсилає email-сповіщення")

    System_Ext(github, "GitHub API", "Публічний REST API. Перевірка існування репозиторію, отримання останнього релізу")
    System_Ext(smtp, "SMTP-сервер", "Доставка підтверджень та нотифікацій")
    System_Ext(redis, "Redis", "Опціональний кеш відповідей GitHub API")
    System_Ext(prometheus, "Prometheus + Grafana", "Збирає метрики з /metrics")

    Rel(user, notifier, "Підписується / скасовує підписку / переглядає підписки", "HTTP REST / gRPC")
    Rel(notifier, github, "Перевіряє repo, отримує releases", "HTTP REST")
    Rel(notifier, smtp, "Надсилає листи", "SMTP/TLS")
    Rel(notifier, redis, "Кешує відповіді API", "Redis protocol")
    Rel(infra, notifier, "Зчитує метрики", "HTTP GET /metrics")
    Rel(notifier, prometheus, "Метрики збираються", "Pull / Prometheus scrape")
```

### 3.2 C4 — Рівень 2: Контейнери

```mermaid
C4Container
    title Контейнери

    Person(user, "Користувач")

    Container_Boundary(app, "GitHub Release Notifier Docker container") {
        Container(web, "HTTP API", "Express / Node.js", "Обробляє REST-запити підписок, health, metrics")
        Container(grpc, "gRPC Server", "@grpc/grpc-js", "Альтернативний інтерфейс")
        Container(scanner, "Release Scanner", "node-cron", "Кожні 15 хв перевіряє нові релізи та надсилає сповіщення")
        Container(db_layer, "DB Layer", "better-sqlite3", "Синхронний SQLite, авто-міграції при старті")
        Container(cache_layer, "Cache Layer", "ioredis", "Redis-кеш; при недоступності — graceful no-op")
        Container(github_svc, "GitHub Service", "axios", "HTTP-клієнт GitHub API")
        Container(notifier_svc, "Notifier Service", "Nodemailer", "Генерує та надсилає електронні листи")
        Container(metrics_svc, "Metrics Service", "prom-client", "Метрики Prometheus")
    }

    ContainerDb(sqlite, "SQLite DB", "better-sqlite3", "Файл app.db: підписки, токени, теги релізів")
    ContainerDb(redis_db, "Redis", "ioredis", "Кеш GitHub API-відповідей")

    System_Ext(github_api, "GitHub API")
    System_Ext(smtp_server, "SMTP Server")

    Rel(user, web, "HTTP REST", "HTTP :3000")
    Rel(user, grpc, "gRPC", ":50051")
    Rel(web, db_layer, "CRUD")
    Rel(grpc, db_layer, "CRUD")
    Rel(scanner, db_layer, "READ repos / subscribers, WRITE last_seen_tag")
    Rel(web, github_svc, "repoExists()")
    Rel(grpc, github_svc, "repoExists()")
    Rel(scanner, github_svc, "getLatestRelease()")
    Rel(github_svc, cache_layer, "cacheGet / cacheSet")
    Rel(github_svc, github_api, "GET /repos/.../releases/latest", "HTTP")
    Rel(web, notifier_svc, "sendConfirmationEmail()")
    Rel(grpc, notifier_svc, "sendConfirmationEmail()")
    Rel(scanner, notifier_svc, "sendReleaseNotification()")
    Rel(notifier_svc, smtp_server, "SMTP/TLS")
    Rel(db_layer, sqlite, "SQL queries")
    Rel(cache_layer, redis_db, "Redis protocol")
    Rel(web, metrics_svc, "metricsMiddleware + /metrics")
```

## 4. Детальний дизайн компонентів

### 4.1 HTTP API

**Файли:** `src/index.js`, `src/routes/subscriptions.js`, `src/middleware/`

#### C4 — Рівень 3: Компоненти HTTP API

```mermaid
C4Component
    title Компоненти HTTP API

    Container_Boundary(web, "HTTP API") {
        Component(app, "Express App", "src/index.js", "Точка входу: middleware pipeline, маршрутизація, запуск сервера та gRPC")
        Component(router, "Subscriptions Router", "src/routes/subscriptions.js", "Всі /api/* ендпоінти: subscribe, confirm, unsubscribe, subscriptions")
        Component(auth_mw, "API Key Auth Middleware", "src/middleware/auth.js", "Перевіряє X-API-Key header; пропускає /confirm та /unsubscribe")
        Component(validate_mw, "Validate Middleware", "src/middleware/validate.js", "validate([fields]) та validateEmail — перевірка вхідних даних")
        Component(error_mw, "Error Handler", "src/middleware/errorHandler.js", "Централізована обробка помилок")
        Component(metrics_mw, "Metrics Middleware", "src/services/metrics.js", "metricsMiddleware: записує http_requests_total та http_request_duration_seconds")
        Component(static_srv, "Static Files", "public/index.html", "Веб-форма підписки та список підписок")
    }

    Rel(app, metrics_mw, "app.use(metricsMiddleware)")
    Rel(app, auth_mw, "app.use('/api', ...)")
    Rel(app, router, "app.use('/api', subscriptionsRouter)")
    Rel(app, error_mw, "app.use(errorHandler)")
    Rel(router, validate_mw, "validate(['email','repo'])")
    Rel(router, validate_mw, "validateEmail")
```

#### Middleware pipeline

```
Запит →
metricsMiddleware →
Static / Health / Metrics →
/api →
Auth Check →
validate →
Router Handler →
DB/GitHub/Notifier →
За помилки errorHandler
```

#### Потік підписки (POST /api/subscribe)

```mermaid
sequenceDiagram
    participant C as Client
    participant MW as Middleware
    participant R as Router
    participant DB as DB Layer
    participant GH as GitHub Service
    participant NF as Notifier

    C->>MW: POST /api/subscribe {email, repo}
    MW->>MW: apiKeyAuth (X-API-Key)
    MW->>MW: validate(['email','repo'])
    MW->>MW: validateEmail
    MW->>R: next()
    R->>GH: isValidRepoFormat(repo)
    R->>GH: repoExists(repo)
    GH-->>R: true / false / throws
    R->>DB: INSERT INTO subscriptions
    DB-->>R: ok / UNIQUE constraint
    R->>NF: sendConfirmationEmail({email, repo, confirmToken})
    NF-->>R: sent (fire-and-forget)
    R-->>C: 200 {message}
```

### 4.2 gRPC-сервер

**Файли:** `src/grpc/server.js`, `proto/notifier.proto`

#### Сервіс `SubscriptionService`

```
service SubscriptionService {
  rpc Subscribe       (SubscribeRequest)       returns (SubscribeResponse);
  rpc Confirm         (ConfirmRequest)         returns (ConfirmResponse);
  rpc Unsubscribe     (UnsubscribeRequest)     returns (UnsubscribeResponse);
  rpc GetSubscriptions(GetSubscriptionsRequest) returns (GetSubscriptionsResponse);
}
```

#### Таблиця gRPC статусів

| Ситуація                   | gRPC статус          |
| -------------------------- | -------------------- |
| Відсутній email/repo       | `INVALID_ARGUMENT`   |
| Невалідний email           | `INVALID_ARGUMENT`   |
| Невалідний формат repo     | `INVALID_ARGUMENT`   |
| Repo не знайдено на GitHub | `NOT_FOUND`          |
| GitHub rate limit          | `RESOURCE_EXHAUSTED` |
| Підписка вже існує         | `ALREADY_EXISTS`     |
| Помилка БД                 | `INTERNAL`           |
| Токен не знайдено          | `NOT_FOUND`          |

#### Порт: `GRPC_PORT` (default: `50051`)

### 4.3 Release Scanner

**Файли:** `src/services/scanner.js`

#### Алгоритм сканування

```mermaid
flowchart TD
    A([Cron trigger кожні 15 хв]) --> B[scannerRunsTotal.inc]
    B --> C[SELECT DISTINCT repo FROM subscriptions WHERE confirmed = 1]
    C --> D{repos.length > 0?}
    D -- ні --> Z([End])
    D -- так --> E[Для кожного repo]
    E --> F[getLatestRelease - repo]
    F --> G{GitHub rate limit?}
    G -- так --> H[Зупинити ітерацію — break]
    G -- ні --> I{latestTag is null?}
    I -- так --> E
    I -- ні --> J[SELECT subscribers WHERE repo = ? AND confirmed = 1]
    J --> K[Для кожного subscriber]
    K --> L{last_seen_tag = null?}
    L -- так --> M[UPDATE last_seen_tag = latestTag - перший запис]
    M --> K
    L -- ні --> N{last_seen_tag = latestTag?}
    N -- так --> K
    N -- ні --> O[UPDATE last_seen_tag = latestTag]
    O --> P[sendReleaseNotification - notificationsSentTotal.inc]
    P --> K
    K --> E
    E --> Z
```

_Примітка: SQL запити скорочено_

**Ключові властивості:**

- Якщо `last_seen_tag IS NULL` — перший запис, нотифікація не надсилається
- При rate limit від GitHub ітерація зупиняється, щоб не витрачати квоту
- При помилці надсилання листа до одного підписника — продовжуємо до наступного
- Розклад налаштовується через `CRON_SCHEDULE`

### 4.4 База даних

**Файли:** `src/db/database.js`, `src/db/queries/`

#### Стратегія підключення

```mermaid
flowchart LR
    A[getDb called] --> B{db already initialized?}
    B -- так --> C[Return existing instance]
    B -- ні --> D[mkdirSync data dir]
    D --> E[new Database DB_PATH]
    E --> F[PRAGMA journal_mode = WAL]
    F --> G[PRAGMA foreign_keys = ON]
    G --> C
```

**Ключові властивості:**

- Для єдиного з'єднання впродовж усього виконання було використано патерн Singleton.
- WAL-режим дозволяє одночасне читання кількома читачами при одному записувачі.
- Авто-міграція запускається при старті сервісу, створює таблиці якщо не існують.

#### Організація SQL-запитів

Усі SQL-рядки винесені в окремі модулі:

<details open>
<summary><strong>src/db/queries</strong></summary>

<details>
<summary><code>database.js</code></summary>

- CREATE_TABLE

</details>

<details>
<summary><code>subscription.js</code></summary>

- INSERT
- CONFIRM_BY_TOKEN
- DELETE_BY_TOKEN
- GET_BY_EMAIL

</details>

<details>
<summary><code>repo.js</code></summary>

- GET_CONFIRMED_REPOS
- GET_CONFIRMED_SUBSCRIBERS_BY_REPO
- UPDATE_LAST_SEEN_TAG

</details>

</details>

Це покращує читабельність, дозволяє легко знайти та змінити будь-який запит.

### 4.5 Кеш

**Файли:** `src/services/cache.js`

```mermaid
flowchart LR
    A[Виклик cacheGet/cacheSet/cacheDel] --> B{connected to Redis?}
    B -- так --> C[Виконати Redis-операцію]
    C --> D{Помилка?}
    D -- так --> E[console.warn + return null/void]
    D -- ні --> F[Повернути результат]
    B -- ні --> G[return null/void - без помилки]
```

**Ключові властивості:**

- Сервіс гнучко працює як з Redis, так і без нього
- За недоступності Redis GitHub API завжди викликається напряму
- TTL кешу на 10 хвилин
- `connected` флаг управляється через події Redis `on('error')` та `on('ready')`

### 4.6 GitHub API-клієнт

**Файли:** `src/services/github.js`

#### Функції

| Функція                   | Опис                                                          |
| ------------------------- | ------------------------------------------------------------- |
| `isValidRepoFormat(repo)` | Синхронна валідація формату `owner/repo`                      |
| `repoExists(repo)`        | GET `/repos/{owner}/{repo}` → true/false/throw                |
| `getLatestRelease(repo)`  | GET `/repos/{owner}/{repo}/releases/latest` → tag string/null |

#### Rate limit handling

При HTTP 429 обидві функції кидають об'єкт:

```js
{ status: 429, retryAfter: Number(headers['retry-after']) }
```

Caller (`router` або `scanner`) вирішує як реагувати:

- Router → HTTP 429 клієнту
- Scanner → `break` з ітерацій

#### Кешування

Перед GitHub API запитом → `cacheGet(key)`\
Після успішної відповіді → `cacheSet(key, data)`\
Змінна `key` = `github:{endpoint}:{repo}`

#### Заголовок Authorization

При наявності `GITHUB_TOKEN` передається як `Authorization: Bearer {token}` через типовий `axios.create`.

### 4.7 Email-нотифікатор (Nodemailer)

**Файли:** `src/services/notifier.js`

#### Функції

**`sendConfirmationEmail({ email, repo, confirmToken })`**

Лист містить:

- Пояснення підписки
- Посилання `{BASE_URL}/api/confirm/{confirmToken}` для підтвердження

**`sendReleaseNotification({ email, repo, tag, unsubscribeToken })`**

Лист містить:

- Назва релізу та тег
- Посилання на реліз на GitHub
- Посилання `{BASE_URL}/api/unsubscribe/{unsubscribeToken}` для відписки

#### SMTP конфігурація

| Змінна        | Значення за замовчуванням     |
| ------------- | ----------------------------- |
| `SMTP_HOST`   | `smtp.ethereal.email`         |
| `SMTP_PORT`   | `587`                         |
| `SMTP_SECURE` | `false`                       |
| `SMTP_USER`   | —                             |
| `SMTP_PASS`   | —                             |
| `SMTP_FROM`   | `noreply@github-notifier.dev` |

Транспорт створюється щоразу (`createTransport()` всередині кожної функції), що дозволяє легко замінити SMTP без перезапуску.

### 4.8 Метрики Prometheus

**Файли:** `src/services/metrics.js`

#### Зареєстровані метрики

| Метрика                         | Тип       | Лейбли                | Опис                             |
| ------------------------------- | --------- | --------------------- | -------------------------------- |
| `http_requests_total`           | Counter   | method, route, status | Кількість HTTP-запитів           |
| `http_request_duration_seconds` | Histogram | method, route, status | Тривалість HTTP-запитів          |
| `subscriptions_total`           | Gauge     | —                     | Загальна кількість підписок в БД |
| `confirmed_subscriptions_total` | Gauge     | —                     | Кількість підтверджених підписок |
| `notifications_sent_total`      | Counter   | —                     | Надіслано release-листів         |
| `scanner_runs_total`            | Counter   | —                     | Запусків cron-сканера            |

Плюс усі Node.js метрики від `prom-client.collectDefaultMetrics`, зокрема `heap`, `event loop lag`, `CPU` тощо.

## 5. Дизайн бази даних

### 5.1 ER-діаграма

```mermaid
erDiagram
    SUBSCRIPTIONS {
        INTEGER id PK "AUTOINCREMENT"
        TEXT email "NOT NULL"
        TEXT repo "NOT NULL"
        INTEGER confirmed "DEFAULT 0"
        TEXT confirm_token "UNIQUE NOT NULL"
        TEXT unsubscribe_token "UNIQUE NOT NULL"
        TEXT last_seen_tag "DEFAULT NULL"
        TEXT created_at "DEFAULT datetime('now')"
    }
```

### 5.2 Індекси та обмеження

```sql
UNIQUE(email, repo)          -- запобігає дублікатам підписок
UNIQUE(confirm_token)        -- кожна підписка має унікальний токен підтвердження
UNIQUE(unsubscribe_token)    -- кожна підписка має унікальний токен відписки
```

### 5.3 Скінченний автомат підписки

```mermaid
stateDiagram-v2
    [*] --> Pending: "POST /api/subscribe"
    Pending --> Confirmed: "GET /api/confirm/#58;token"
    Pending --> Deleted: "GET /api/unsubscribe/#58;token"
    Confirmed --> Deleted: "GET /api/unsubscribe/#58;token"
    Confirmed --> Confirmed: "Scanner оновлює last_seen_tag"
    Deleted --> [*]
```

### 5.4 Життєвий цикл підписки

1. **Pending** — `confirmed = 0`, лист надіслано, очікуємо підтвердження
2. **Confirmed** — `confirmed = 1`, Scanner включає до перевірки
3. **First scan** — `last_seen_tag = NULL` → встановлюється поточний тег, лист не надсилається
4. **Active** — `last_seen_tag != NULL` → лист надсилається лише при зміні тега

## 6. CI/CD та якість коду

### 6.1 GitHub Actions Pipeline

```mermaid
flowchart LR
    PR([Pull Request / Push]) --> L[Job: Lint & Format]
    PR --> T[Job: Test]

    L --> L1[pnpm install]
    L1 --> L2[pnpm lint - ESLint flat config v10]
    L2 --> L3[pnpm format:check - Prettier]

    T --> T1[pnpm install]
    T1 --> T2[sudo apt install python3 make g++]
    T2 --> T3[pnpm test:ci]
    T3 --> T4[Vitest --run --coverage --reporter dot]
    T4 --> T5[DB_PATH=:memory: NODE_ENV=test]
```

Обидві роботи запускаються паралельно.

### 6.2 Pre-commit хуки (Lefthook)

```yaml
# lefthook.yml
pre-commit:
    parallel: true
    commands:
        lint:
            glob: "*.js"
            run: pnpm exec eslint --fix {staged_files}
            stage_fixed: true
        format:
            glob: "*.{js,json,md}"
            run: pnpm exec prettier --write {staged_files}
            stage_fixed: true

pre-push:
    jobs:
        - name: packages audit
          run: pnpm audit --audit-level=high
```

**Ключові властивості:**

- ESLint та Prettier запускаються паралельно лише для доданих у коміт файлів
- `stage_fixed: true` автоматично переіндексовує виправлені файли
- `pnpm audit` — перевірка вразливостей перед push
