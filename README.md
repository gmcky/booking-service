# Booking Service

Backend for a property booking platform (Airbnb-like). Built with Node.js, TypeScript, PostgreSQL, Redis.

This is a portfolio project. The goal is to solve real backend problems — not just CRUD, but concurrency, payment processing, async jobs, and proper auth — in a way that's easy to read and reason about.

## What's interesting here

- **Double-booking prevention** — Serializable transaction isolation level on booking creation. Two users booking the same dates at the same time won't both succeed.
- **JWT with rotation and reuse detection** — refresh tokens are hashed, tracked by jti, and if a stolen token is reused, all sessions for that user get invalidated.
- **Stripe payment flow** — PaymentIntent creation, webhook handling with signature verification, idempotent event processing (no double charges on webhook retries).
- **Background workers** — email, image resizing, payouts, cleanup — all via BullMQ with retry and exponential backoff. App stays fast, heavy work happens async.
- **Brute-force protection** — login attempts tracked in Redis, account locks after 5 failures for 15 minutes.

## Tech stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 20, TypeScript 5.9 (strict, ESM) |
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

Prerequisites: Node.js 20+, pnpm, Docker.

```bash
cd server
pnpm install
pnpm infra:up          # starts Postgres + Redis in Docker
pnpm db:migrate        # applies migrations
pnpm dev               # app on http://localhost:3000
```

## API Documentation & Testing

This project provides two ways to explore and test the API:

1. **Swagger UI** — Interactive API documentation. Available at `/api-docs` when the server is running. It provides a quick overview of all endpoints and their schemas.
2. **Bruno Collection** — A complete set of API requests located in the `server/bruno/` directory. This is the **recommended** way to test complex flows (authentication, booking creation, Stripe webhooks). 

To use Bruno:
- Install [Bruno](https://www.usebruno.com/).
- Open the `server/bruno/` folder in Bruno.
- Use the `Local` environment.
- Run requests sequentially (e.g., Login -> Create Property).
```bash
pnpm workers
```

### Other ways to run

**Full Docker** (app + infra):
```bash
pnpm docker:dev
```

**Production build**:
```bash
pnpm docker:prod
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

**Payments** — Stripe PaymentIntent, webhook processing, refund request/approve/reject flow

**Reviews** — create (only after completed booking), host replies, reporting

**Users** — profile, avatar upload, password change, email change (OTP), account deletion

## Testing

```bash
pnpm test              # all tests
pnpm test:unit         # unit only
pnpm test:integration  # uses Testcontainers (needs Docker)
pnpm test:coverage     # with coverage report
```

Unit tests cover booking logic, payment helpers, date utilities, validation.
Integration tests use real Postgres via Testcontainers — no mocked database for integration scenarios.

## Environment

Copy `.env.example` to `.env`. Key variables:

- `DATABASE_URL` — Postgres connection string
- `REDIS_HOST`, `REDIS_PORT` — Redis for cache, queues, rate limiting
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — signing keys
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — Stripe API
- `SMTP_*` — email sending
- `S3_BUCKET`, `AWS_REGION` — image storage

## Status

Backend is feature-complete. Frontend not started. No CI/CD pipeline yet.

See `stack.md` for rationale behind tech choices.

## License

MIT
