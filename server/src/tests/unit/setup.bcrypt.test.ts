import { describe, expect, it } from "vitest";
import bcrypt from "bcrypt";

describe("test setup bcrypt mock", () => {
  it("forces bcrypt hash cost to 04 in tests", async () => {
    const hash = await bcrypt.hash("password", 12);

    expect(hash).toMatch(/^\$2[aby]\$04\$/);
    await expect(bcrypt.compare("password", hash)).resolves.toBe(true);
  });
});
