import dotenv from "dotenv";
import { cleanEnv, str, port, url, num, bool } from "envalid";

dotenv.config({ quiet: process.env.DOTENV_LOGS !== "true" });

export const env = cleanEnv(process.env, {
  NODE_ENV: str({
    choices: ["development", "production", "test"],
    default: "development",
  }),
  PORT: port({ default: 3000 }),
  DATABASE_URL: url(),

  // Redis
  REDIS_HOST: str({ default: "localhost" }),
  REDIS_PORT: port({ default: 6379 }),
  REDIS_PASSWORD: str({ default: "" }),
  REDIS_USERNAME: str({ default: "" }),

  // JWT
  JWT_ACCESS_SECRET: str(),
  JWT_REFRESH_SECRET: str(),
  JWT_ACCESS_EXPIRES_IN: str({ default: "15m" }),
  JWT_REFRESH_EXPIRES_IN: str({ default: "7d" }),

  // Google Sign-In (OIDC ID-token audience, verified against Google's JWKS)
  GOOGLE_CLIENT_ID: str(),

  // Logging
  LOG_LEVEL: str({
    default: "info",
    choices: ["debug", "info", "warn", "error"],
  }),
  LOG_PRETTY_PRINT: bool({ default: false }),

  // CORS
  CORS_ORIGIN: str({ default: "http://localhost:3000" }),

  // Frontend base URL (email verification links, etc.)
  CLIENT_URL: str({ default: "http://localhost:3001" }),

  // Rate limiting (global read ceiling; auth/write limiters are separate
  // and hardcoded stricter). Map browse fires 2 requests per pan — 100 was
  // exhausted by ~50 pans and locked real users out for a whole window.
  RATE_LIMIT_WINDOW_MS: num({ default: 900000 }), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: num({ default: 1000 }),

  // Account Lockout (login brute-force protection)
  LOGIN_MAX_ATTEMPTS: num({ default: 5 }),
  LOGIN_LOCKOUT_MINUTES: num({ default: 15 }),

  // SMTP (email worker)
  SMTP_HOST: str({ default: "localhost" }),
  SMTP_PORT: port({ default: 1025 }),
  SMTP_SECURE: bool({ default: false }), // true = TLS (port 465), false = STARTTLS / plain
  SMTP_USER: str({ default: "" }),
  SMTP_PASSWORD: str({ default: "" }),
  EMAIL_FROM: str({ default: "noreply@booking-service.local" }),

  // S3-compatible object storage (avatars + property images; AWS S3 or Cloudflare R2)
  AWS_REGION: str({ default: "us-east-1" }),
  S3_BUCKET: str({ default: "" }),
  // Non-AWS endpoint (e.g. https://<account>.r2.cloudflarestorage.com); empty = AWS
  S3_ENDPOINT: str({ default: "" }),
  // Public base URL objects are served from (e.g. https://pub-xxx.r2.dev); empty = AWS virtual-host URL
  S3_PUBLIC_URL: str({ default: "" }),

  // Stripe
  STRIPE_SECRET_KEY: str({ default: "" }),
  STRIPE_WEBHOOK_SECRET: str({ default: "" }),

  // Operational alerts (Slack/Telegram/email bridge webhook)
  ALERT_WEBHOOK_URL: str({ default: "" }),

  // API Documentation
  SWAGGER_ENABLED: bool({ default: true }),
  API_VERSION: str({ default: "v1" }),
  PUBLIC_URL: url({ default: "http://localhost:3000" }),

  // Sentry (optional — disabled if unset)
  SENTRY_DSN: str({ default: "" }),

  // Demo cleanup cron — flip to false + restart workers to drop the schedule.
  DEMO_CLEANUP_ENABLED: bool({ default: false }),
  DEMO_CLEANUP_CRON: str({ default: "0 3 * * *" }),

  // Geocoding (Nominatim / OpenStreetMap; usage policy requires a
  // descriptive User-Agent and max 1 request per second)
  GEOCODER_URL: url({ default: "https://nominatim.openstreetmap.org/search" }),
  GEOCODER_USER_AGENT: str({ default: "gmck-booking-portfolio/1.0 (booking.gmcky.dev)" }),
  // Address autocomplete (Photon — Nominatim's policy forbids autocomplete,
  // Photon is built for it; also OSM data, returns names in English)
  PHOTON_URL: url({ default: "https://photon.komoot.io/api" }),
});
