import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, afterAll, vi } from "vitest";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";

vi.mock("../shared/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

declare global {
  // Shared singleton used by src/shared/lib/prisma.ts in test mode.
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;

  // Integration test infra references.
  // eslint-disable-next-line no-var
  var __integrationPostgresContainer: StartedPostgreSqlContainer | undefined;
  // eslint-disable-next-line no-var
  var __integrationPrismaClient: PrismaClient | undefined;
  // eslint-disable-next-line no-var
  var __integrationPgPool: Pool | undefined;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "../..");

beforeAll(async () => {
  if (globalThis.__integrationPostgresContainer) return;

  const container = await new PostgreSqlContainer("postgres:16-alpine")
    .withDatabase("booking_test")
    .withUsername("booking")
    .withPassword("booking")
    .start();

  const host = container.getHost();
  const port = container.getPort();
  const database = String(container.getDatabase());
  const username = String(container.getUsername());
  const password = String(container.getPassword());
  const databaseUrl = `postgresql://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/${database}?schema=public`;

  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = databaseUrl;
  process.env.JWT_ACCESS_SECRET ??= "integration-access-secret";
  process.env.JWT_REFRESH_SECRET ??= "integration-refresh-secret";
  process.env.JWT_ACCESS_EXPIRES_IN ??= "15m";
  process.env.JWT_REFRESH_EXPIRES_IN ??= "7d";
  process.env.CORS_ORIGIN ??= "http://localhost:3000";
  process.env.API_VERSION ??= "v1";

  // Faster than replaying all migrations for ephemeral integration DBs.
  execSync("pnpm prisma db push --accept-data-loss --config prisma.config.ts", {
    cwd: projectRoot,
    env: process.env,
    stdio: "pipe",
  });

  const pool = new Pool({
    host,
    port,
    database,
    user: username,
    password,
  });
  pool.on("error", () => {
    // Ignore pool errors during teardown when container is being stopped.
  });

  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({
    adapter,
    log: [],
  });
  await prisma.$connect();

  globalThis.__integrationPostgresContainer = container;
  globalThis.__integrationPrismaClient = prisma;
  globalThis.__integrationPgPool = pool;
  globalThis.prisma = prisma;
});

afterAll(async () => {
  if (globalThis.__integrationPrismaClient) {
    await globalThis.__integrationPrismaClient.$disconnect();
    globalThis.__integrationPrismaClient = undefined;
    globalThis.prisma = undefined;
  }

  if (globalThis.__integrationPgPool) {
    await globalThis.__integrationPgPool.end();
    globalThis.__integrationPgPool = undefined;
  }

  if (globalThis.__integrationPostgresContainer) {
    await globalThis.__integrationPostgresContainer.stop();
    globalThis.__integrationPostgresContainer = undefined;
  }
});
