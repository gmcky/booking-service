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

vi.mock("../shared/queues/email.queue.js", () => ({
  emailQueue: {
    add: vi.fn(),
  },
}));
