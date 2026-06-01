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
  <a href="#live-demo">Live demo</a> •
  <a href="#design-decisions">Design decisions</a> •
  <a href="#tech-stack">Stack</a> •
  <a href="#getting-started">Quick start</a> •
  <a href="#project-structure">Structure</a> •
  <a href="#api-documentation--testing">API docs</a> •
  <a href="#testing">Testing</a> •
  <a href="#cicd">CI/CD</a> •
  <a href="#known-limitations">Limitations</a>
</p>

---

Property rental API built as a portfolio project. Covers property listings, bookings with overlap prevention, Stripe payments with webhook idempotency, JWT rotation with reuse detection, and async email/image processing via BullMQ workers. Everything runs in Docker.

## Live demo

- **API base:** https://booking-api.gmcky.dev/api/v1
- **Interactive docs (Swagger):** https://booking-api.gmcky.dev/api-docs
- **Health check:** https://booking-api.gmcky.dev/health

### Demo credentials

| Role | Email | Password | Notes |
|------|-------|----------|-------|
| USER | `demo@booking.dev` | `demo1234` | Empty account — create your own properties and bookings here. |

The database is seeded with ~20 properties across Kyiv, Lviv, Odesa and a few EU cities, plus ~9 bookings covering every status (pending, confirmed, refund-requested, cancelled, completed). Only the demo user above is public; the seeded host/admin accounts use private passwords.

### Try it

Everything below happens inside Swagger UI — no terminal required.

1. Open the [interactive docs](https://booking-api.gmcky.dev/api-docs).
2. Expand `POST /auth/login`. The demo credentials are pre-filled — click **Try it out → Execute** and copy the `accessToken` from the response.
3. Click the **Authorize** button at the top of the page, paste the token, then close the dialog. Every protected endpoint is now unlocked.
4. From there: browse properties, create a booking, leave a review, etc. Public endpoints like `GET /properties` work without logging in.

## Design decisions

- **Double-booking prevention** — Serializable transaction isolation on booking creation ensures concurrent requests for the same dates resolve correctly.
- **JWT rotation with reuse detection** — refresh tokens are hashed and tracked by jti. Reuse of a token (e.g. from a stolen session) triggers full invalidation for that user.
- **Stripe payment flow** — PaymentIntent lifecycle, webhook signature verification, and idempotent event processing via a processed-events table.
- **Background workers** — email, image resizing, payouts, and cleanup run as separate BullMQ processes with retry and exponential backoff.
- **Brute-force protection** — failed login attempts tracked in Redis; account locks after 5 failures for 15 minutes.
- **Error monitoring** — Sentry captures unhandled exceptions and 5xx responses in production with full stack traces, request context, and trace sampling for performance insights.

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
| Monitoring | Sentry (errors + performance) |
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

## Known limitations

These are deliberate scope decisions for a portfolio project, not oversights.

- **No email verification** — accounts are active immediately on registration.
- **No password reset** — no forgot-password flow; users can change their password only while logged in.
- **No host KYC** — any registered user can list a property.
- **Partial refunds** — `charge.refunded` webhooks only flip payment status to `REFUNDED` on a full refund. A partial refund issued from the Stripe dashboard is logged but leaves the booking status unchanged until the full amount is returned.
- **Login lockout is per-email, not per-IP** — a distributed brute-force attack across IPs is not blocked.
- **Pagination is offset-based** — consistent ordering isn't guaranteed under concurrent inserts on high-traffic listings.

## License

MIT
