import { vi } from "vitest";

// config/env.ts validates the entire environment at import time (envalid
// calls process.exit on failure). CI runs unit tests without any .env, so
// the no-default vars must exist before any suite imports a module
// that transitively pulls in config/env.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
process.env.JWT_ACCESS_SECRET ??= "unit-test-access-secret";
process.env.JWT_REFRESH_SECRET ??= "unit-test-refresh-secret";
process.env.GOOGLE_CLIENT_ID ??= "unit-test-client-id.apps.googleusercontent.com";

vi.mock("bcrypt", async () => {
  const actual = await vi.importActual<typeof import("bcrypt")>("bcrypt");
  // bcrypt enforces a minimum cost factor of 4, so use 4 explicitly.
  const fastHash = (data: string | Buffer) => actual.hash(data, 4);

  return {
    default: {
      ...actual,
      hash: fastHash,
      compare: actual.compare,
      genSalt: actual.genSalt,
    },
    hash: fastHash,
    compare: actual.compare,
    genSalt: actual.genSalt,
  };
});

vi.mock("../shared/lib/prisma.js", () => ({
  prisma: {},
}));

vi.mock("../shared/lib/stripe.js", () => ({
  stripe: {},
}));

vi.mock("../shared/lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock("../shared/queues/email.queue.js", () => ({
  emailQueue: {
    add: vi.fn(),
  },
}));

vi.mock("../shared/lib/cache.js", () => ({
  cacheClient: {},
  cacheGet: vi.fn().mockResolvedValue(null),
  cacheSet: vi.fn().mockResolvedValue(undefined),
  cacheDel: vi.fn().mockResolvedValue(undefined),
  cacheGetNamespaceVersion: vi.fn().mockResolvedValue("0"),
  cacheInvalidateNamespace: vi.fn().mockResolvedValue(undefined),
  hashKey: vi.fn((data: unknown) => JSON.stringify(data)),
}));

vi.mock("../shared/lib/ops-alert.js", () => ({
  sendOpsAlert: vi.fn().mockResolvedValue(undefined),
}));
