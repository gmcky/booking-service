import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { getIdParam, getQueryParam } from "../../shared/utils/request.helpers.js";

function makeReq(params: Record<string, unknown>, query: Record<string, unknown> = {}): Request {
  return { params, query } as unknown as Request;
}

describe("getIdParam", () => {
  it("returns id when valid id param exists", () => {
    const req = makeReq({ id: "123" });

    expect(getIdParam(req)).toBe("123");
  });

  it("throws AppError(400) when id param is missing", () => {
    const req = makeReq({});
    const call = () => getIdParam(req);

    expect(call).toThrowError(AppError);
    expect(call).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        message: "Invalid id parameter",
      }),
    );
  });

  it("throws AppError(400) when id param is an array", () => {
    const req = makeReq({ id: ["1", "2"] });
    const call = () => getIdParam(req);

    expect(call).toThrowError(AppError);
    expect(call).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        message: "Invalid id parameter",
      }),
    );
  });

  it("returns custom param when paramName is provided", () => {
    const req = makeReq({ bookingId: "bk_1" });

    expect(getIdParam(req, "bookingId")).toBe("bk_1");
  });

  it("uses custom paramName in AppError message", () => {
    const req = makeReq({});
    const call = () => getIdParam(req, "bookingId");

    expect(call).toThrowError(AppError);
    expect(call).toThrowError(
      expect.objectContaining({
        statusCode: 400,
        message: "Invalid bookingId parameter",
      }),
    );
  });
});

describe("getQueryParam", () => {
  it("returns string value when query param is a string", () => {
    const req = makeReq({}, { search: "test" });
    expect(getQueryParam(req, "search")).toBe("test");
  });

  it("returns first element when query param is an array of strings", () => {
    const req = makeReq({}, { ids: ["1", "2"] });
    expect(getQueryParam(req, "ids")).toBe("1");
  });

  it("returns undefined when query param is an array but first element is not a string", () => {
    const req = makeReq({}, { filters: [{ val: 1 }, "2"] });
    expect(getQueryParam(req, "filters")).toBeUndefined();
  });

  it("returns undefined when query param is a complex object", () => {
    const req = makeReq({}, { user: { name: "John" } });
    expect(getQueryParam(req, "user")).toBeUndefined();
  });

  it("returns undefined when query param is missing", () => {
    const req = makeReq({}, {});
    expect(getQueryParam(req, "missing")).toBeUndefined();
  });
});
