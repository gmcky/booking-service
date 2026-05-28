<p align="center">
  <img src="https://em-content.zobj.net/source/apple/391/house_1f3e0.png" width="90" />
</p>

<h1 align="center">booking-service</h1>

<p align="center">
  <strong>Property rental API.</strong>
</p>

<p align="center">
  <a href="https://github.com/gmcky/booking-service/stargazers"><img src="https://img.shields.io/github/stars/gmcky/booking-service?style=flat&color=blue" alt="Stars"></a>
  <a href="https://github.com/gmcky/booking-service/commits/main"><img src="https://img.shields.io/github/last-commit/gmcky/booking-service?style=flat" alt="Last Commit"></a>
  <img src="https://img.shields.io/badge/node-22-brightgreen?style=flat" alt="Node 22">
  <img src="https://img.shields.io/badge/typescript-5.9-blue?style=flat" alt="TypeScript">
</p>

<p align="center">
  <a href="#design-decisions">Design decisions</a> •
  <a href="#tech-stack">Stack</a> •
  <a href="#getting-started">Quick start</a> •
  <a href="#project-structure">Structure</a> •
  <a href="#api-documentation--testing">API docs</a> •
  <a href="#testing">Testing</a> •
  <a href="#cicd">CI/CD</a>
</p>

---

Property rental API built as a portfolio project. Covers property listings, bookings with overlap prevention, Stripe payments with webhook idempotency, JWT rotation with reuse detection, and async email/image processing via BullMQ workers. Everything runs in Docker.

## Design decisions

- **Double-booking prevention** — Serializable transaction isolation on booking creation ensures concurrent requests for the same dates resolve correctly.
- **JWT rotation with reuse detection** — refresh tokens are hashed and tracked by jti. Reuse of a token (e.g. from a stolen session) triggers full invalidation for that user.
- **Stripe payment flow** — PaymentIntent lifecycle, webhook signature verification, and idempotent event processing via a processed-events table.
- **Background workers** — email, image resizing, payouts, and cleanup run as separate BullMQ processes with retry and exponential backoff.
- **Brute-force protection** — failed login attempts tracked in Redis; account locks after 5 failures for 15 minutes.

## Tech stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 22, TypeScript 5.9 (strict, ESM) |
| Framework | Express 5 |
| Database | PostgreSQL 16, Prisma 7 |
| Cache & Queues | Redis 7, BullMQ |
| Auth | JWT via jose, bcrypt |
| Payments | Stripe (PaymentIntent + webhooks) |
| Validation | Zod 4 |
| Images | Sharp (resize, webp conversion) |
| Storage | AWS S3 |
| Email | Nodemailer via BullMQ worker |
| Logging | Pino (structured JSON) |
| Testing | Vitest, Testcontainers, Supertest |
| Infra | Docker, Docker Compose (dev + prod) |

## Getting started

Prerequisites: Node.js 22+, pnpm, Docker.

```bash
git clone https://github.com/gmcky/booking-service
cd booking-service/server

cp .env.example .env   # fill in secrets

pnpm install
pnpm infra:up          # starts Postgres + Redis in Docker
pnpm db:migrate        # applies migrations
pnpm db:seed           # optional test data
pnpm dev               # http://localhost:3000
```

Workers run as separate processes:

```bash
pnpm workers
```

**Full Docker** (app + infra):
```bash
pnpm docker:dev
```

## Project structure

```
server/
├── src/
│   ├── modules/           # feature modules, each with controller/service/routes/validators
│   │   ├── auth/          # register, login, refresh, logout
│   │   ├── users/         # profiles, avatars, password change, soft delete
│   │   ├── properties/    # CRUD, search filters, image pipeline
│   │   ├── bookings/      # availability, reservations, date management
│   │   ├── payments/      # Stripe integration, webhooks, refunds
│   │   └── reviews/       # ratings, host replies, moderation
│   ├── shared/
│   │   ├── lib/           # prisma, redis, stripe, logger clients
│   │   ├── middlewares/   # auth, validation, error handling
│   │   ├── queues/        # BullMQ queue definitions
│   │   └── utils/         # date helpers, pagination
│   └── workers/           # BullMQ workers (email, image, cleanup, payout)
├── prisma/
│   ├── schema.prisma      # 7 models + 2 helper tables
│   └── migrations/
├── bruno/                 # API test collection
└── docker-compose*.yml    # infra / dev / prod configs
```

## API overview

All endpoints under `/api/v1`. Auth via Bearer token (access) + HttpOnly cookie (refresh).

**Auth** — register, login, logout, refresh (with rotation)

**Properties** — list with filters (city, dates, guests, amenities, price range), CRUD, image upload

**Bookings** — create (with availability check), reschedule, cancel, status transitions, blocked dates

**Payments** — Stripe PaymentIntent, webhook processing, refund flow

**Reviews** — create (only after completed booking), host replies, reporting

**Users** — profile, avatar upload, password change, account deletion

## API documentation & testing

**Swagger UI** — available at `/api/v1/docs` when the server is running. Good for a quick look at schemas and endpoint signatures.

**Bruno collection** — located in `server/bruno/`. The better option for testing actual flows — auth, booking lifecycle, Stripe webhooks. Install [Bruno](https://www.usebruno.com/), open the folder, use the `Local` environment, and run requests in sequence (e.g. Login → Create Property → Book → Pay).

## Testing

```bash
pnpm test              # all tests
pnpm test:unit         # unit only
pnpm test:integration  # uses Testcontainers (needs Docker running)
pnpm test:coverage     # with coverage report
```

Unit tests cover booking logic, payment helpers, date utilities, auth lockout. Integration tests use real Postgres via Testcontainers — no mocked database for integration scenarios.

## CI/CD

Every push runs typecheck, lint, and unit tests on GitHub Actions. Branches get the checks, `main` gets the full pipeline.

On merge to `main`: the Docker image is built and pushed to GHCR, then the VPS pulls it and restarts the containers over SSH — no manual deploys. The whole thing takes under 2 minutes from merge to live.

```
push → Tests & Checks → Build & Push (GHCR) → Deploy (VPS)
```

Workers and the API server run as separate containers from the same image. SSH keys, GHCR credentials, and the VPS address are stored as GitHub Actions secrets. VPS runs on DigitalOcean.

## Environment

Copy `.env.example` to `.env`. Key variables:

- `DATABASE_URL` — Postgres connection string
- `REDIS_HOST`, `REDIS_PORT` — Redis for cache, queues, rate limiting
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — signing keys
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Stripe API
- `SMTP_*` — email sending
- `S3_BUCKET`, `AWS_REGION` — image storage

## License

MIT
