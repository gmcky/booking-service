import { describe, expect, it } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { validate } from "../../shared/middlewares/validate.js";

// Regression: Express 5's req.query is a prototype getter that re-parses the
// URL on every access, so parsed values written by mutating one returned
// object are lost. The middleware must shadow the getter with an own property
// so handlers see the coerced/transformed values.
describe("validate middleware (query target)", () => {
  const schema = z.object({
    amenities: z
      .preprocess(
        (val) => (typeof val === "string" ? val.split(",") : val),
        z.array(z.enum(["WIFI", "KITCHEN"])).optional(),
      )
      .optional(),
    page: z.coerce.number().int().positive().default(1),
  });

  function buildApp() {
    const app = express();
    app.get("/test", validate(schema, "query"), (req, res) => {
      const { amenities, page } = req.query as unknown as {
        amenities?: string[];
        page: number;
      };
      res.json({
        amenities,
        amenitiesIsArray: Array.isArray(amenities),
        page,
        pageType: typeof page,
      });
    });
    return app;
  }

  it("handler sees CSV string transformed into an array", async () => {
    const res = await request(buildApp()).get("/test?amenities=WIFI,KITCHEN");

    expect(res.status).toBe(200);
    expect(res.body.amenitiesIsArray).toBe(true);
    expect(res.body.amenities).toEqual(["WIFI", "KITCHEN"]);
  });

  it("handler sees coerced numbers and defaults", async () => {
    const res = await request(buildApp()).get("/test?page=3");

    expect(res.status).toBe(200);
    expect(res.body.page).toBe(3);
    expect(res.body.pageType).toBe("number");

    const withDefault = await request(buildApp()).get("/test");
    expect(withDefault.body.page).toBe(1);
  });

  it("rejects invalid values with an error", async () => {
    const res = await request(buildApp()).get("/test?amenities=NOT_REAL");

    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
