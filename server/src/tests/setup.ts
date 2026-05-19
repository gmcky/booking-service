import { vi } from "vitest";

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
