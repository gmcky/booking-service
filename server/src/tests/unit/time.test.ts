import { describe, expect, it } from "vitest";
import { parseExpiry } from "../../shared/utils/time.js";
import { AppError } from "../../shared/middlewares/error.handler.js";

describe("parseExpiry", () => {
  it("parses minutes and days to milliseconds", () => {
    expect(parseExpiry("15m")).toBe(15 * 60 * 1000);
    expect(parseExpiry("7d")).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("throws on invalid unit", () => {
    const call = () => parseExpiry("15x");

    expect(call).toThrowError(AppError);
    expect(call).toThrowError(expect.objectContaining({ statusCode: 400, message: 'Invalid expiry format: "15x"' }));
  });

  it("throws on missing unit", () => {
    const call = () => parseExpiry("15");

    expect(call).toThrowError(AppError);
    expect(call).toThrowError(expect.objectContaining({ statusCode: 400, message: 'Invalid expiry format: "15"' }));
  });
});
