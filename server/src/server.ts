import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./shared/lib/logger.js";
import { prisma } from "./shared/lib/prisma.js";

const app = createApp();

// Start server
const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      nodeVersion: process.version,
    },
    "Server started successfully",
  );
});

// Graceful shutdown
const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down gracefully");

  server.close(async () => {
    logger.info("HTTP server closed");

    try {
      await prisma.$disconnect();
      logger.info("Database connection closed");
      process.exit(0);
    } catch (error) {
      logger.error({ error }, "Error during shutdown");
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error({ error }, "Uncaught exception");
  shutdown("uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
  shutdown("unhandledRejection");
});
