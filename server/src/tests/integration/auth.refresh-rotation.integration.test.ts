import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import express, { type Application } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import type { PrismaClient } from "@prisma/client";

let app: Application;
let prisma: PrismaClient;

function getCookieValue(setCookieHeader: string | string[] | undefined, name: string): string {
  const cookies = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];

  if (!cookies.length) {
    throw new Error(`Missing Set-Cookie header for ${name}`);
  }

  const rawCookie = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  if (!rawCookie) {
    throw new Error(`Cookie ${name} not found in response`);
  }

  const nameValuePair = rawCookie.split(";")[0];
  if (!nameValuePair) {
    throw new Error(`Cookie ${name} is malformed`);
  }

  return nameValuePair.slice(`${name}=`.length);
}

async function registerAndGetRefreshToken() {
  const response = await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: `rotation-${Date.now()}@example.com`,
      password: "S3cure!Passw0rd#2026",
      firstName: "Rotation",
      lastName: "Tester",
    });

  expect(response.status).toBe(201);

  const refreshToken = getCookieValue(response.headers["set-cookie"], "refreshToken");

  return {
    userId: response.body.user.id as string,
    refreshToken,
  };
}

describe("Auth refresh token rotation integration", () => {
  beforeAll(async () => {
    const [{ authRouter }, { errorHandler }, { prisma: prismaClient }] = await Promise.all([
      import("../../modules/auth/auth.routes.js"),
      import("../../shared/middlewares/error.handler.js"),
      import("../../shared/lib/prisma.js"),
    ]);

    prisma = prismaClient;

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api/v1/auth", authRouter);
    app.use(errorHandler);
  });

  beforeEach(async () => {
    if (!prisma) return;
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  it("login -> refresh rotates token, old token reuse returns 401 and revokes sessions", async () => {
    const email = `login-rotation-${Date.now()}@example.com`;
    const password = "S3cure!Passw0rd#2026";

    const registerResponse = await request(app).post("/api/v1/auth/register").send({
      email,
      password,
      firstName: "Login",
      lastName: "Rotation",
    });

    expect(registerResponse.status).toBe(201);
    const userId = registerResponse.body.user.id as string;

    const loginResponse = await request(app).post("/api/v1/auth/login").send({
      email,
      password,
    });

    // 1. login -> receives refresh token (in cookie)
    expect(loginResponse.status).toBe(200);
    expect(loginResponse.body.accessToken).toEqual(expect.any(String));
    const initialRefreshToken = getCookieValue(loginResponse.headers["set-cookie"], "refreshToken");

    // 2. refresh -> receives new access token + rotated refresh token
    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `refreshToken=${initialRefreshToken}`)
      .send();

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));
    const rotatedRefreshToken = getCookieValue(
      refreshResponse.headers["set-cookie"],
      "refreshToken",
    );
    expect(rotatedRefreshToken).not.toBe(initialRefreshToken);

    // 3. old refresh token reuse -> 401
    const reusedOldTokenResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `refreshToken=${initialRefreshToken}`)
      .send();

    expect(reusedOldTokenResponse.status).toBe(401);
    expect(reusedOldTokenResponse.body).toMatchObject({
      error: "Invalid refresh token",
    });

    // 4. all user sessions revoked after reuse detection
    const activeTokens = await prisma.refreshToken.count({
      where: { userId },
    });

    expect(activeTokens).toBe(0);
  });

  it("returns a new refresh token on successful rotation", async () => {
    const { refreshToken: initialRefreshToken } = await registerAndGetRefreshToken();

    const refreshResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `refreshToken=${initialRefreshToken}`)
      .send();

    expect(refreshResponse.status).toBe(200);
    expect(refreshResponse.body.accessToken).toEqual(expect.any(String));

    const rotatedRefreshToken = getCookieValue(
      refreshResponse.headers["set-cookie"],
      "refreshToken",
    );

    expect(rotatedRefreshToken).toEqual(expect.any(String));
    expect(rotatedRefreshToken).not.toBe(initialRefreshToken);
  });

  it("rejects old token after rotation and revokes all sessions", async () => {
    const { userId, refreshToken: initialRefreshToken } = await registerAndGetRefreshToken();

    const firstRotation = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `refreshToken=${initialRefreshToken}`)
      .send();

    expect(firstRotation.status).toBe(200);

    const newRefreshToken = getCookieValue(firstRotation.headers["set-cookie"], "refreshToken");

    const reusedOldTokenResponse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `refreshToken=${initialRefreshToken}`)
      .send();

    expect(reusedOldTokenResponse.status).toBe(401);
    expect(reusedOldTokenResponse.body).toMatchObject({
      error: "Invalid refresh token",
    });

    const usingNewTokenAfterReuse = await request(app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `refreshToken=${newRefreshToken}`)
      .send();

    expect(usingNewTokenAfterReuse.status).toBe(401);

    const activeTokens = await prisma.refreshToken.count({
      where: { userId },
    });

    expect(activeTokens).toBe(0);
  });

  it("handles concurrent refresh requests with the same token", async () => {
    const { refreshToken: initialRefreshToken } = await registerAndGetRefreshToken();

    const [first, second] = await Promise.all([
      request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", `refreshToken=${initialRefreshToken}`)
        .send(),
      request(app)
        .post("/api/v1/auth/refresh")
        .set("Cookie", `refreshToken=${initialRefreshToken}`)
        .send(),
    ]);

    const statuses = [first.status, second.status];
    const successCount = statuses.filter((status) => status === 200).length;

    // In a rotation race, only one request can succeed at most.
    expect(successCount).toBeLessThanOrEqual(1);
    expect(statuses.some((status) => status !== 200)).toBe(true);
    expect(statuses.every((status) => [200, 401, 404].includes(status))).toBe(true);

    const remainingTokens = await prisma.refreshToken.count();
    expect(remainingTokens).toBeLessThanOrEqual(1);
  });
});
