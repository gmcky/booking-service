import { prisma } from "../../shared/lib/prisma.js";
import { AppError } from "../../shared/middlewares/error.handler.js";
import { logger } from "../../shared/lib/logger.js";
import { cacheClient } from "../../shared/lib/cache.js";
import { parseExpiry } from "../../shared/utils/time.js";
import type {
  RegisterInput,
  LoginInput,
  AuthResponse,
  AuthTokens,
  GoogleAuthInput,
} from "./auth.types.js";
import { getCachedAuthUser, setCachedAuthUser } from "./auth.cache.js";
import { emailQueue } from "../../shared/queues/email.queue.js";
import bcrypt from "bcrypt";
import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { env } from "../../config/env.js";
import type { User } from "@prisma/client";
import crypto from "crypto";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/client";

const EMAIL_VERIFY_TTL_SECONDS = 24 * 60 * 60;
const EMAIL_VERIFY_INVALID_MESSAGE =
  "This verification link is invalid or has expired. Request a new one from your profile.";
const RESEND_VERIFICATION_MAX_ATTEMPTS = 3;
const RESEND_VERIFICATION_WINDOW_SECONDS = 60 * 60;
const PWD_RESET_TTL_SECONDS = 60 * 60;
const PWD_RESET_INVALID_MESSAGE = "This reset link is invalid or has expired. Request a new one.";
const FORGOT_PASSWORD_MAX_ATTEMPTS = 3;
const FORGOT_PASSWORD_WINDOW_SECONDS = 60 * 60;

// Pre-encode once; avoids per-request TextEncoder churn.
const ACCESS_SECRET = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const REFRESH_SECRET = new TextEncoder().encode(env.JWT_REFRESH_SECRET);

// A real (cost-12) bcrypt hash that no password verifies against. The
// no-such-user login path compares against this so its latency matches a
// genuine wrong-password attempt — otherwise the missing bcrypt call makes
// unknown emails answer measurably faster, enabling user enumeration.
const DUMMY_PASSWORD_HASH = "$2b$12$D1WSx5rWJnI9DP7/o6ZsWuvQxA86RqoD73x3ZSVCfV3TfLmoZAhzW";

// jose caches this internally (keyed by URL) — one JWKS fetch, reused and
// refreshed automatically across requests.
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const GOOGLE_CREDENTIAL_INVALID_MESSAGE = "Invalid Google credential";

export class AuthService {
  /**
   * Atomic user creation and initial refresh session.
   */
  static async register(
    data: RegisterInput,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthResponse> {
    const existingUser = await prisma.user.findFirst({
      where: {
        isDeleted: false,
        OR: [
          { email: data.email.toLowerCase() },
          ...(data.phoneNumber ? [{ phoneNumber: data.phoneNumber }] : []),
        ],
      },
    });

    if (existingUser) {
      logger.warn(
        {
          email: data.email.toLowerCase(),
          phoneNumber: data.phoneNumber,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
        "Registration rejected: duplicate account",
      );
      throw new AppError(409, "Registration failed");
    }

    const passwordHash = await bcrypt.hash(data.password, 12);

    try {
      // Crypto/bcrypt kept outside tx to reduce lock time.
      const userId = crypto.randomUUID();
      const jti = crypto.randomUUID();
      const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
      const expiresAt = new Date(Date.now() + refreshExpiresIn);

      const email = data.email.toLowerCase();
      const accessToken = await this.generateAccessToken({
        id: userId,
        email,
        role: "USER",
      });
      const refreshToken = await this.generateRefreshToken({ id: userId }, jti);
      const tokenHash = this.hashToken(refreshToken);

      // Write-only DB ops for predictable tx latency.
      const user = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            id: userId,
            email,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            phoneNumber: data.phoneNumber || null,
            role: "USER",
          },
        });

        await tx.refreshToken.create({
          data: {
            tokenHash,
            jti,
            userId,
            expiresAt,
            ip: meta?.ip || null,
            userAgent: meta?.userAgent || null,
          },
        });

        return user;
      });

      logger.info(
        {
          userId: user.id,
          email: user.email,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
        "User registered successfully",
      );

      // Fail-soft: the account is already committed; a Redis/queue blip must
      // not turn registration into a 500. The user can resend from the banner.
      try {
        await this.sendVerificationEmail(user);
      } catch (error) {
        logger.error({ err: error, userId: user.id }, "Failed to queue verification email");
      }

      return {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          avatarUrl: user.avatarUrl,
          emailVerified: user.emailVerifiedAt != null,
        },
        accessToken,
        refreshToken,
      };
    } catch (error) {
      // Normalize unique-constraint conflicts.
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          logger.warn(
            {
              email: data.email.toLowerCase(),
              phoneNumber: data.phoneNumber,
              ip: meta?.ip,
              userAgent: meta?.userAgent,
              code: error.code,
            },
            "Registration failed due to unique constraint",
          );
          throw new AppError(409, "Registration failed");
        }
      }
      throw error;
    }
  }

  /**
   * Credential validation with lockout guards and session issuance.
   */
  static async login(
    data: LoginInput,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthResponse> {
    const email = data.email.toLowerCase();

    // Short-circuit before bcrypt to block enumeration.
    await this.checkLockout(email, meta);

    const user = await prisma.user.findFirst({
      where: {
        email,
        isDeleted: false,
      },
    });

    // Consistent 401 response for absent user or bad password. The dummy
    // compare keeps this branch's latency in line with a real wrong-password
    // attempt so an unknown email can't be told apart by timing.
    if (!user || !user.passwordHash) {
      logger.warn(
        { email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Login failed: user not found",
      );
      await bcrypt.compare(data.password, DUMMY_PASSWORD_HASH);
      await this.recordFailedAttempt(email, meta);
      throw new AppError(401, "Invalid credentials");
    }

    // Google-only accounts carry an unusable dummy hash — comparing against
    // it would always fail anyway, so skip bcrypt and hint at the fix
    // directly. This deliberately discloses the account's auth method (a
    // documented enumeration trade-off); it does not affect the
    // isDeleted/isSuspended ordering below, which only ever runs for
    // password-capable accounts.
    if (user.hasPassword === false) {
      logger.warn(
        { userId: user.id, email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Login failed: account uses Google sign-in only",
      );
      throw new AppError(401, "This account uses Google sign-in. Use the Google button to log in.");
    }

    const isValidPassword = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValidPassword) {
      logger.warn(
        { userId: user.id, email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Login failed: invalid password",
      );
      await this.recordFailedAttempt(email, meta);
      throw new AppError(401, "Invalid credentials");
    }

    // Suspension is disclosed only after the password checks out — otherwise
    // any password would reveal that an email belongs to a suspended account.
    if (user.isSuspended) {
      logger.warn(
        { userId: user.id, email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Login blocked: account is suspended",
      );
      throw new AppError(403, "Account is suspended");
    }

    await this.clearLockout(email);

    const result = await this.issueSession(user, meta);

    logger.info(
      { userId: user.id, email, ip: meta?.ip, userAgent: meta?.userAgent },
      "User logged in",
    );

    return result;
  }

  /**
   * Verifies a Google Identity Services ID token and signs the user in,
   * auto-linking or creating an account as needed. Issues the same
   * access+refresh pair as password login.
   */
  static async googleAuth(
    data: GoogleAuthInput,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthResponse> {
    let payload;
    try {
      const verification = await jwtVerify(data.credential, googleJwks, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: env.GOOGLE_CLIENT_ID,
        algorithms: ["RS256"],
      });
      payload = verification.payload;
    } catch (error) {
      logger.warn(
        {
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          error: (error as Error).message,
        },
        "Google sign-in rejected: credential verification failed",
      );
      throw new AppError(401, GOOGLE_CREDENTIAL_INVALID_MESSAGE);
    }

    if (payload.email_verified !== true) {
      logger.warn(
        { ip: meta?.ip, userAgent: meta?.userAgent, sub: payload.sub },
        "Google sign-in rejected: email not verified with Google",
      );
      throw new AppError(401, GOOGLE_CREDENTIAL_INVALID_MESSAGE);
    }

    const googleId = payload.sub;
    const rawEmail = typeof payload.email === "string" ? payload.email : undefined;
    if (!googleId || !rawEmail) {
      logger.warn(
        { ip: meta?.ip, userAgent: meta?.userAgent },
        "Google sign-in rejected: credential missing sub or email",
      );
      throw new AppError(401, GOOGLE_CREDENTIAL_INVALID_MESSAGE);
    }
    const email = rawEmail.toLowerCase();

    // Looked up without the isDeleted filter on purpose: googleId is a
    // unique column that a soft-deleted account can still be holding, and
    // creating a fresh user would otherwise collide with it. A hit here —
    // deleted or not — means we must not fall through to account creation.
    let user = await prisma.user.findUnique({ where: { googleId } });

    if (user?.isDeleted) {
      logger.warn(
        { userId: user.id, ip: meta?.ip, userAgent: meta?.userAgent },
        "Google sign-in rejected: account is deleted",
      );
      throw new AppError(401, GOOGLE_CREDENTIAL_INVALID_MESSAGE);
    }

    if (!user) {
      // isDeleted:false mirrors login's user lookup — a soft-deleted
      // account's email is anonymized on delete, so it can never match
      // here and can never be resurrected/linked by this path.
      const existingByEmail = await prisma.user.findFirst({
        where: { email, isDeleted: false },
      });

      if (existingByEmail) {
        if (existingByEmail.emailVerifiedAt === null) {
          // Pre-hijack guard: an UNVERIFIED password account never proved it
          // owns this mailbox — anyone could have registered it with the
          // Google user's address and a password they know. Google's proof
          // wins: take the account over for the mailbox owner by scrubbing
          // the password (unusable hash, hasPassword=false), marking the
          // email verified, and revoking every existing session.
          const scrubHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
          const [updated] = await prisma.$transaction([
            prisma.user.update({
              where: { id: existingByEmail.id },
              data: {
                googleId,
                emailVerifiedAt: new Date(),
                passwordHash: scrubHash,
                hasPassword: false,
              },
            }),
            prisma.refreshToken.deleteMany({ where: { userId: existingByEmail.id } }),
          ]);
          user = updated;
          logger.warn(
            { userId: user.id, email },
            "Google account linked to UNVERIFIED user: password scrubbed, sessions revoked",
          );
        } else {
          user = await prisma.user.update({
            where: { id: existingByEmail.id },
            data: { googleId },
          });
          logger.info({ userId: user.id, email }, "Google account linked to existing user");
        }
      }
    }

    if (!user) {
      const dummyPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await bcrypt.hash(dummyPassword, 12);
      const givenName =
        typeof payload.given_name === "string" && payload.given_name
          ? payload.given_name
          : email.split("@")[0] || "User";
      const familyName = typeof payload.family_name === "string" ? payload.family_name : "";
      const avatarUrl = typeof payload.picture === "string" ? payload.picture : null;

      try {
        user = await prisma.user.create({
          data: {
            email,
            googleId,
            passwordHash,
            hasPassword: false,
            firstName: givenName,
            lastName: familyName,
            avatarUrl,
            emailVerifiedAt: new Date(),
            role: "USER",
          },
        });
      } catch (error) {
        // Two concurrent first sign-ins can race past the lookups and both
        // attempt the create; the loser lands here. Re-read instead of 500.
        if (error instanceof PrismaClientKnownRequestError && error.code === "P2002") {
          user = await prisma.user.findUnique({ where: { googleId } });
          if (!user || user.isDeleted) {
            throw new AppError(401, GOOGLE_CREDENTIAL_INVALID_MESSAGE);
          }
        } else {
          throw error;
        }
      }

      logger.info({ userId: user.id, email }, "User signed in via Google (account created)");
    }

    // Same suspension handling as password login.
    if (user.isSuspended) {
      logger.warn(
        { userId: user.id, email, ip: meta?.ip, userAgent: meta?.userAgent },
        "Google sign-in blocked: account is suspended",
      );
      throw new AppError(403, "Account is suspended");
    }

    const result = await this.issueSession(user, meta);

    logger.info(
      { userId: user.id, email, ip: meta?.ip, userAgent: meta?.userAgent },
      "User logged in via Google",
    );

    return result;
  }

  /**
   * Shared session-issuance tail for login and Google sign-in: signs a
   * fresh access+refresh pair, persists the refresh session, prunes
   * expired/excess sessions, and shapes the AuthResponse.
   */
  private static async issueSession(
    user: Pick<
      User,
      "id" | "email" | "firstName" | "lastName" | "role" | "avatarUrl" | "emailVerifiedAt"
    >,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthResponse> {
    const jti = crypto.randomUUID();
    const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshExpiresIn);

    const accessToken = await this.generateAccessToken(user);
    const refreshToken = await this.generateRefreshToken(user, jti);
    const tokenHash = this.hashToken(refreshToken);

    // Persist session and prune stale/excess tokens in one batch.
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.create({
        data: {
          tokenHash,
          jti,
          userId: user.id,
          expiresAt,
          ip: meta?.ip || null,
          userAgent: meta?.userAgent || null,
        },
      });

      await tx.refreshToken.deleteMany({
        where: {
          userId: user.id,
          expiresAt: { lt: new Date() },
        },
      });

      // Cap active sessions to prevent unbounded growth.
      const tokensToPrune = await tx.refreshToken.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        skip: 5,
        select: { id: true },
      });

      if (tokensToPrune.length) {
        await tx.refreshToken.deleteMany({
          where: { id: { in: tokensToPrune.map((t) => t.id) } },
        });
      }
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        avatarUrl: user.avatarUrl,
        emailVerified: user.emailVerifiedAt != null,
      },
      accessToken,
      refreshToken,
    };
  }

  /**
   * Session revocation via refresh token invalidation.
   */
  static async logout(
    refreshToken: string,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<void> {
    if (!refreshToken) {
      throw new AppError(401, "No refresh token provided");
    }

    let payload;
    try {
      const verification = await jwtVerify(refreshToken, REFRESH_SECRET, {
        algorithms: ["HS256"],
        issuer: "booking-service",
        audience: "booking-api",
      });
      payload = verification.payload;
    } catch (error) {
      logger.warn(
        {
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          error: (error as Error).message,
        },
        "Logout failed: invalid refresh token (signature)",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const jti = payload.jti as string | undefined;
    const userId = payload.userId as string | undefined;

    if (!jti || !userId) {
      logger.warn(
        { ip: meta?.ip, userAgent: meta?.userAgent },
        "Logout failed: refresh token missing jti or userId",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { jti },
    });

    if (!storedToken) {
      // Token missing from DB usually indicates rotation race or reuse.
      await prisma.refreshToken.deleteMany({ where: { userId } });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Logout failed: refresh token reuse detected (missing stored token)",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const isMatch = this.hashToken(refreshToken) === storedToken.tokenHash;
    if (!isMatch) {
      await prisma.refreshToken.deleteMany({
        where: { userId: storedToken.userId },
      });
      logger.warn(
        {
          userId: storedToken.userId,
          jti,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
        "Logout failed: refresh token hash mismatch (reuse)",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: storedToken.id } }),
      prisma.refreshToken.deleteMany({
        where: {
          userId: storedToken.userId,
          expiresAt: { lt: new Date() },
        },
      }),
    ]);

    logger.info(
      {
        userId: storedToken.userId,
        jti,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      },
      "User logged out",
    );
  }

  /**
   * Token rotation with nuke-on-reuse protection.
   */
  static async refreshToken(
    refreshToken: string,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<AuthTokens> {
    let payload;
    try {
      const verification = await jwtVerify(refreshToken, REFRESH_SECRET, {
        algorithms: ["HS256"],
        issuer: "booking-service",
        audience: "booking-api",
      });
      payload = verification.payload;
    } catch (error) {
      logger.warn(
        {
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          error: (error as Error).message,
        },
        "Refresh token rejected: invalid signature or expired JWT",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const jti = payload.jti as string | undefined;
    const userId = payload.userId as string | undefined;

    if (!jti || !userId) {
      logger.warn(
        { ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: missing jti or userId claim",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { jti },
      include: { user: true },
    });

    if (!storedToken) {
      // Reuse signal: missing jti on refresh triggers full session revocation.
      await prisma.refreshToken.deleteMany({ where: { userId } });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token reuse detected — all sessions revoked",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    if (storedToken.user.isDeleted || storedToken.user.isSuspended) {
      await prisma.refreshToken.deleteMany({
        where: { userId: storedToken.userId },
      });
      logger.warn(
        { userId: storedToken.userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: user is disabled",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    // Defensive cleanup for JWTs that outlived DB records.
    if (storedToken.expiresAt < new Date()) {
      await prisma.refreshToken.delete({ where: { id: storedToken.id } });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: expired (DB record)",
      );
      throw new AppError(401, "Refresh token expired");
    }

    const isMatch = this.hashToken(refreshToken) === storedToken.tokenHash;
    if (!isMatch) {
      await prisma.refreshToken.deleteMany({
        where: { userId: storedToken.userId },
      });
      logger.warn(
        { userId, jti, ip: meta?.ip, userAgent: meta?.userAgent },
        "Refresh token rejected: hash mismatch — all sessions revoked",
      );
      throw new AppError(401, "Invalid refresh token");
    }

    const user = storedToken.user;
    const newJti = crypto.randomUUID();
    const refreshExpiresIn = parseExpiry(env.JWT_REFRESH_EXPIRES_IN);
    const expiresAt = new Date(Date.now() + refreshExpiresIn);

    const accessToken = await this.generateAccessToken(user);
    const newRefreshToken = await this.generateRefreshToken(user, newJti);
    const tokenHash = this.hashToken(newRefreshToken);

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({ where: { id: storedToken.id } });

      await tx.refreshToken.create({
        data: {
          tokenHash,
          jti: newJti,
          userId: user.id,
          expiresAt,
          ip: meta?.ip ?? null,
          userAgent: meta?.userAgent ?? null,
        },
      });

      await tx.refreshToken.deleteMany({
        where: {
          userId: user.id,
          expiresAt: { lt: new Date() },
        },
      });
    });

    logger.info(
      {
        userId: user.id,
        oldJti: jti,
        newJti,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      },
      "Refresh token rotated",
    );

    return { accessToken, refreshToken: newRefreshToken };
  }

  static async verifyAccessToken(
    token: string,
  ): Promise<{ id: string; email: string; role: string }> {
    let payload;
    try {
      const verification = await jwtVerify(token, ACCESS_SECRET, {
        algorithms: ["HS256"],
        issuer: "booking-service",
        audience: "booking-api",
      });
      payload = verification.payload;
    } catch (error) {
      const err = error as Error & { code?: string };
      if (err.code === "ERR_JWT_EXPIRED") {
        throw new AppError(401, "Token expired");
      }
      throw new AppError(401, "Invalid token");
    }

    const userId = payload.userId as string | undefined;
    const email = payload.email as string | undefined;
    const role = payload.role as string | undefined;

    if (!userId || !email || !role) {
      throw new AppError(401, "Invalid token structure");
    }

    const cached = await getCachedAuthUser(userId);
    if (cached) {
      logger.debug({ userId, endpoint: "verifyAccessToken" }, "Access token verified (cache hit)");
      return cached;
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false, isSuspended: false },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      throw new AppError(401, "Invalid token");
    }

    await setCachedAuthUser({ id: user.id, email: user.email, role: user.role });

    logger.debug({ userId, endpoint: "verifyAccessToken" }, "Access token verified");

    return { id: user.id, email: user.email, role: user.role };
  }

  private static async generateAccessToken(
    user: Pick<User, "id" | "email" | "role">,
  ): Promise<string> {
    const token = await new SignJWT({
      userId: user.id,
      email: user.email,
      role: user.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setIssuer("booking-service")
      .setAudience("booking-api")
      .setNotBefore("0s")
      .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
      .sign(ACCESS_SECRET);

    return token;
  }

  private static async generateRefreshToken(user: Pick<User, "id">, jti: string): Promise<string> {
    const token = await new SignJWT({
      userId: user.id,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setJti(jti)
      .setIssuedAt()
      .setIssuer("booking-service")
      .setAudience("booking-api")
      .setNotBefore("0s")
      .setExpirationTime(env.JWT_REFRESH_EXPIRES_IN)
      .sign(REFRESH_SECRET);

    return token;
  }

  private static hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  // Fixed-window lockout key; TTL anchored to first failure (non-sliding window).
  private static lockoutKey(email: string): string {
    return `auth:lockout:${email}`;
  }

  // Fail-open on Redis outage; auth should degrade, not hard-stop.
  private static async checkLockout(
    email: string,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<void> {
    try {
      const raw = await cacheClient.get(this.lockoutKey(email));
      if (!raw) return;

      const attempts = parseInt(raw, 10);
      if (attempts >= env.LOGIN_MAX_ATTEMPTS) {
        const ttl = await cacheClient.ttl(this.lockoutKey(email));
        const minutesLeft = ttl > 0 ? Math.ceil(ttl / 60) : env.LOGIN_LOCKOUT_MINUTES;
        logger.warn(
          { email, attempts, ttl, ip: meta?.ip, userAgent: meta?.userAgent },
          "Login blocked: account is locked",
        );
        throw new AppError(
          429,
          `Account temporarily locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`,
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.warn(
        { email, error: (error as Error).message },
        "Lockout check skipped — Redis unavailable",
      );
    }
  }

  // TTL set once to keep lockout as fixed window, not sliding window.
  private static async recordFailedAttempt(
    email: string,
    meta?: { ip?: string | undefined; userAgent?: string | undefined },
  ): Promise<void> {
    try {
      const key = this.lockoutKey(email);
      const attempts = await cacheClient.incr(key);
      if (attempts === 1) {
        await cacheClient.expire(key, env.LOGIN_LOCKOUT_MINUTES * 60);
      }
      if (attempts >= env.LOGIN_MAX_ATTEMPTS) {
        logger.warn(
          { email, attempts, ip: meta?.ip, userAgent: meta?.userAgent },
          `Account locked after ${attempts} failed login attempts`,
        );
      }
    } catch (error) {
      logger.warn(
        { email, error: (error as Error).message },
        "Failed to record login attempt — Redis unavailable",
      );
    }
  }

  private static async clearLockout(email: string): Promise<void> {
    try {
      await cacheClient.del(this.lockoutKey(email));
    } catch {
      // Best-effort cleanup; stale counters self-expire via TTL.
    }
  }

  private static emailVerifyKey(userId: string): string {
    return `email_verify:${userId}`;
  }

  private static verifyResendKey(userId: string): string {
    return `verify_resend:${userId}`;
  }

  /**
   * Issues a fresh link token, stashes its hash in Redis (hashed-at-rest,
   * mirrors the email-change OTP pattern), and enqueues the delivery email.
   * A repeat call rotates the token — the SET overwrite invalidates any
   * link still in flight.
   */
  private static async sendVerificationEmail(
    user: Pick<User, "id" | "email" | "firstName">,
  ): Promise<void> {
    const secret = crypto.randomBytes(32).toString("base64url");
    const token = `${user.id}.${secret}`;
    const secretHash = crypto.createHash("sha256").update(secret).digest("hex");

    await cacheClient.set(this.emailVerifyKey(user.id), secretHash, "EX", EMAIL_VERIFY_TTL_SECONDS);

    await emailQueue.add("verify-email", {
      to: user.email,
      firstName: user.firstName,
      verifyUrl: `${env.CLIENT_URL}/verify-email?token=${token}`,
    });

    logger.info({ userId: user.id }, "Verification email queued");
  }

  /**
   * Consumes a verification link token. Errors are deliberately generic
   * (expired/missing/mismatch all read the same) to avoid leaking which
   * failure mode occurred.
   */
  static async verifyEmail(token: string): Promise<void> {
    const separatorIndex = token.indexOf(".");
    if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
      throw new AppError(400, EMAIL_VERIFY_INVALID_MESSAGE);
    }

    const userId = token.slice(0, separatorIndex);
    const secret = token.slice(separatorIndex + 1);

    const storedHash = await cacheClient.get(this.emailVerifyKey(userId));
    if (!storedHash) {
      throw new AppError(400, EMAIL_VERIFY_INVALID_MESSAGE);
    }

    const candidateHash = crypto.createHash("sha256").update(secret).digest("hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    const candidateBuf = Buffer.from(candidateHash, "hex");

    const isMatch =
      storedBuf.length === candidateBuf.length && crypto.timingSafeEqual(storedBuf, candidateBuf);

    if (!isMatch) {
      throw new AppError(400, EMAIL_VERIFY_INVALID_MESSAGE);
    }

    await cacheClient.del(this.emailVerifyKey(userId));

    try {
      await prisma.user.update({
        where: { id: userId },
        data: { emailVerifiedAt: new Date() },
      });
    } catch (error) {
      if (error instanceof PrismaClientKnownRequestError && error.code === "P2025") {
        throw new AppError(400, EMAIL_VERIFY_INVALID_MESSAGE);
      }
      throw error;
    }

    logger.info({ userId }, "Email verified");
  }

  /**
   * Fixed-window rate limit (3/hour) on top of the standard resend flow.
   * Already-verified accounts are a silent no-op — nothing to confirm, no
   * email sent.
   */
  static async resendVerificationEmail(userId: string): Promise<void> {
    const key = this.verifyResendKey(userId);
    const attempts = await cacheClient.incr(key);
    if (attempts === 1) {
      await cacheClient.expire(key, RESEND_VERIFICATION_WINDOW_SECONDS);
    }
    if (attempts > RESEND_VERIFICATION_MAX_ATTEMPTS) {
      logger.warn({ userId, attempts }, "Resend verification email rate limit exceeded");
      throw new AppError(429, "Too many verification emails requested. Please try again later.");
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
    });
    if (!user) {
      throw new AppError(404, "User not found");
    }

    if (user.emailVerifiedAt !== null) {
      return;
    }

    await this.sendVerificationEmail(user);
  }

  private static pwdResetKey(userId: string): string {
    return `pwd_reset:${userId}`;
  }

  private static pwdResetRequestKey(email: string): string {
    return `pwd_reset_req:${email}`;
  }

  /**
   * Issues a fresh link token, stashes its hash in Redis (hashed-at-rest,
   * mirrors sendVerificationEmail). A repeat call rotates the token — the
   * SET overwrite invalidates any link still in flight.
   */
  private static async sendPasswordResetEmail(
    user: Pick<User, "id" | "email" | "firstName">,
  ): Promise<void> {
    const secret = crypto.randomBytes(32).toString("base64url");
    const token = `${user.id}.${secret}`;
    const secretHash = crypto.createHash("sha256").update(secret).digest("hex");

    await cacheClient.set(this.pwdResetKey(user.id), secretHash, "EX", PWD_RESET_TTL_SECONDS);

    await emailQueue.add("password-reset", {
      to: user.email,
      firstName: user.firstName,
      resetUrl: `${env.CLIENT_URL}/reset-password?token=${token}`,
    });

    logger.info({ userId: user.id }, "Password reset email queued");
  }

  /**
   * Fixed-window rate limit (3/hour) per email. Always resolves without
   * throwing — this is the account-enumeration-proof entry point, so an
   * unknown email and a rate-limited email both look identical to the
   * caller (silent success, no email sent).
   */
  static async forgotPassword(email: string): Promise<void> {
    const key = this.pwdResetRequestKey(email);
    const attempts = await cacheClient.incr(key);
    if (attempts === 1) {
      await cacheClient.expire(key, FORGOT_PASSWORD_WINDOW_SECONDS);
    }
    if (attempts > FORGOT_PASSWORD_MAX_ATTEMPTS) {
      logger.warn({ email, attempts }, "Forgot-password rate limit exceeded");
      return;
    }

    const user = await prisma.user.findFirst({
      where: { email, isDeleted: false },
      select: { id: true, email: true, firstName: true },
    });

    if (!user) {
      logger.info({ email }, "Forgot-password requested for unknown email");
      return;
    }

    await this.sendPasswordResetEmail(user);
  }

  /**
   * Consumes a reset link token. Errors are deliberately generic
   * (expired/missing/mismatch/unknown-user all read the same) to avoid
   * leaking which failure mode occurred.
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    const separatorIndex = token.indexOf(".");
    if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
      throw new AppError(400, PWD_RESET_INVALID_MESSAGE);
    }

    const userId = token.slice(0, separatorIndex);
    const secret = token.slice(separatorIndex + 1);

    const storedHash = await cacheClient.get(this.pwdResetKey(userId));
    if (!storedHash) {
      throw new AppError(400, PWD_RESET_INVALID_MESSAGE);
    }

    const candidateHash = crypto.createHash("sha256").update(secret).digest("hex");
    const storedBuf = Buffer.from(storedHash, "hex");
    const candidateBuf = Buffer.from(candidateHash, "hex");

    const isMatch =
      storedBuf.length === candidateBuf.length && crypto.timingSafeEqual(storedBuf, candidateBuf);

    if (!isMatch) {
      throw new AppError(400, PWD_RESET_INVALID_MESSAGE);
    }

    const user = await prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, email: true, firstName: true, emailVerifiedAt: true },
    });
    if (!user) {
      throw new AppError(400, PWD_RESET_INVALID_MESSAGE);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          // Google-only accounts (hasPassword=false) regain the password
          // grant here — reset is mailbox-proof gated, so this is the safe
          // "set a password" path for them.
          hasPassword: true,
          // A successful reset proves mailbox ownership — piggyback the
          // verification if the account hadn't confirmed its email yet.
          ...(user.emailVerifiedAt === null ? { emailVerifiedAt: new Date() } : {}),
        },
      }),
      prisma.refreshToken.deleteMany({ where: { userId } }),
    ]);

    await cacheClient.del(this.pwdResetKey(userId));
    await this.clearLockout(user.email);

    await emailQueue.add("password-changed-notification", {
      email: user.email,
      firstName: user.firstName,
      changedAtIso: new Date().toISOString(),
    });

    logger.info({ userId }, "Password reset successfully");
  }
}
