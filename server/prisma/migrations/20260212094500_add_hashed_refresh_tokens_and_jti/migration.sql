-- This migration adds security improvements to refresh tokens:
-- 1. Stores hashed tokens instead of plaintext
-- 2. Adds jti (JWT ID) for token rotation detection

-- Clear all existing refresh tokens (users will need to re-login)
DELETE FROM "refresh_tokens";

-- Drop the old unique constraint and index on token
DROP INDEX IF EXISTS "refresh_tokens_token_key";

-- Rename token column to tokenHash
ALTER TABLE "refresh_tokens" RENAME COLUMN "token" TO "tokenHash";

-- Add jti column with unique constraint
ALTER TABLE "refresh_tokens" ADD COLUMN "jti" TEXT NOT NULL;

-- Create new unique constraints and indices
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");
CREATE UNIQUE INDEX "refresh_tokens_jti_key" ON "refresh_tokens"("jti");
CREATE INDEX "refresh_tokens_jti_idx" ON "refresh_tokens"("jti");
