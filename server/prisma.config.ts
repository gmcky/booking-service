import { config } from "dotenv";
import { existsSync } from "fs";

config({ path: existsSync(".env.development") ? ".env.development" : ".env" });
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
