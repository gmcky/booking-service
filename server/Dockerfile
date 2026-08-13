# ====================
# Build Stage
# ====================
FROM node:22-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@10.30.3

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies (including dev dependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Generate Prisma Client (dummy URL satisfies Prisma 7 env validation at generate time)
RUN DATABASE_URL=postgresql://x:x@x:5432/x pnpm prisma generate

# Build TypeScript
RUN pnpm build

# ====================
# Production Stage
# ====================
FROM node:22-alpine

# Install pnpm
RUN npm install -g pnpm@10.30.3

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy built application and dependencies from builder (includes generated Prisma client)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Uploads mountpoint must exist before chown so the named volume
# inherits nodejs ownership on first mount (empty-volume copy-up).
RUN mkdir -p uploads

# Change ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start application
CMD ["node", "dist/server.js"]
