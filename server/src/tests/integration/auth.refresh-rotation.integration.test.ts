import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import type { Application } from "express";
import request from "supertest";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import type { PrismaClient } from "@prisma/client";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "../../../");

let postgresContainer: StartedTestContainer;
let app: Application;
let prisma: PrismaClient;

function getCookieValue(
  setCookieHeader: string | string[] | undefined,
  name: string,
): string {
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
  const response = await request(app).post("/api/v1/auth/register").send({
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
    postgresContainer = await new GenericContainer("postgres:16-alpine")
      .withEnvironment({
        POSTGRES_DB: "booking_test",
        POSTGRES_USER: "booking",
        POSTGRES_PASSWORD: "booking",
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage("database system is ready to accept connections"),
      )
      .start();

    const host = postgresContainer.getHost();
    const port = postgresContainer.getMappedPort(5432);

    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = `postgresql://booking:booking@${host}:${port}/booking_test?schema=public`;
    process.env.JWT_ACCESS_SECRET = "integration-access-secret";
    process.env.JWT_REFRESH_SECRET = "integration-refresh-secret";
    process.env.JWT_ACCESS_EXPIRES_IN = "15m";
    process.env.JWT_REFRESH_EXPIRES_IN = "7d";
    process.env.CORS_ORIGIN = "http://localhost:3000";
    process.env.API_VERSION = "v1";
    process.env.REDIS_HOST = "127.0.0.1";
    process.env.REDIS_PORT = "6379";

    execSync("pnpm prisma migrate deploy --config prisma.config.ts", {
      cwd: projectRoot,
      env: process.env,
      stdio: "pipe",
    });

    const [{ authRouter }, { errorHandler }, { prisma: prismaClient }, expressModule, cookieParserModule] =
      await Promise.all([
        import("../../modules/auth/auth.routes.js"),
        import("../../shared/middlewares/error.handler.js"),
        import("../../shared/lib/prisma.js"),
        import("express"),
        import("cookie-parser"),
      ]);

    prisma = prismaClient;

    const express = expressModule.default;
    const cookieParser = cookieParserModule.default;

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

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
    if (postgresContainer) {
      await postgresContainer.stop();
    }
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
    expect(statuses.every((status) => [200, 401, 404].includes(status))).toBe(
      true,
    );

    const remainingTokens = await prisma.refreshToken.count();
    expect(remainingTokens).toBeLessThanOrEqual(1);
  });
});
