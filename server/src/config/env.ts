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

  // Logging
  LOG_LEVEL: str({
    default: "info",
    choices: ["debug", "info", "warn", "error"],
  }),
  LOG_PRETTY_PRINT: bool({ default: true }),

  // CORS
  CORS_ORIGIN: str({ default: "http://localhost:3000" }),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: num({ default: 900000 }), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: num({ default: 100 }),

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

  // S3 (avatar storage)
  AWS_REGION: str({ default: "us-east-1" }),
  S3_BUCKET: str({ default: "" }),

  // Stripe
  STRIPE_SECRET_KEY: str({ default: "" }),
  STRIPE_WEBHOOK_SECRET: str({ default: "" }),

  // Operational alerts (Slack/Telegram/email bridge webhook)
  ALERT_WEBHOOK_URL: str({ default: "" }),

  // API Documentation
  SWAGGER_ENABLED: bool({ default: true }),
  API_VERSION: str({ default: "v1" }),
});
