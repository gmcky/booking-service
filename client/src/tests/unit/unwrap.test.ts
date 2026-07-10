import { describe, it, expect } from "vitest";
import { unwrap, unwrapVoid } from "@/lib/api/unwrap";

function jsonResponse(status: number): Response {
  return new Response(null, { status });
}

describe("unwrap", () => {
  it("returns data on success", () => {
    const result = unwrap({ data: { id: "1" }, response: jsonResponse(200) });
    expect(result).toEqual({ id: "1" });
  });

  it("uses details[0].message when present", () => {
    expect(() =>
      unwrap({
        error: { error: "Validation failed", details: [{ message: "Check-in cannot be in the past" }] },
        response: jsonResponse(400),
      }),
    ).toThrow("Check-in cannot be in the past");
  });

  it("falls back to error string when details is empty", () => {
    expect(() =>
      unwrap({ error: { error: "Validation failed", details: [] }, response: jsonResponse(400) }),
    ).toThrow("Validation failed");
  });

  it("falls back to error string when details[0].message is not a string", () => {
    expect(() =>
      unwrap({
        error: { error: "Validation failed", details: [{ message: 123 }] },
        response: jsonResponse(400),
      }),
    ).toThrow("Validation failed");
  });

  it("falls back to status-based message for an unknown error shape", () => {
    expect(() => unwrap({ error: "oops", response: jsonResponse(500) })).toThrow(
      "Request failed (500)",
    );
  });
});

describe("unwrapVoid", () => {
  it("does not throw on a successful response", () => {
    expect(() => unwrapVoid({ response: jsonResponse(204) })).not.toThrow();
  });

  it("uses details[0].message when present", () => {
    expect(() =>
      unwrapVoid({
        error: { error: "Validation failed", details: [{ message: "Check-in cannot be in the past" }] },
        response: jsonResponse(400),
      }),
    ).toThrow("Check-in cannot be in the past");
  });
});
