import type { Options } from "swagger-jsdoc";
import { env } from "./env.js";

export const swaggerOptions: Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Booking Service API",
      version: "1.0.0",
      description: "Backend API for a property booking platform (Airbnb-like).",
      contact: {
        name: "API Support",
        email: "80690640+gmcky@users.noreply.github.com",
        url: "https://github.com/gmcky",
      },
      license: {
        name: "MIT",
      },
    },
    servers: [
      {
        url: `http://localhost:${env.PORT}/api/${env.API_VERSION}`,
        description: "Local development server",
      },
    ],
    tags: [
      { name: "Auth", description: "Authentication and session management" },
      { name: "Users", description: "User profiles and admin user ops" },
      { name: "Properties", description: "Property listings and management" },
      { name: "Bookings", description: "Booking lifecycle and availability" },
      { name: "Payments", description: "Payments, refunds, Stripe webhook" },
      { name: "Reviews", description: "Property reviews and reports" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        Error: {
          type: "object",
          properties: {
            error: { type: "string" },
            details: { type: "object" },
          },
          required: ["error"],
        },
        Pagination: {
          type: "object",
          properties: {
            page: { type: "integer" },
            limit: { type: "integer" },
            total: { type: "integer" },
          },
        },
      },
      responses: {
        Unauthorized: {
          description: "Missing or invalid auth token",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        Forbidden: {
          description: "Insufficient permissions",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        NotFound: {
          description: "Resource not found",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
        ValidationError: {
          description: "Request validation failed",
          content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  // Path to the API docs
  apis: ["./src/modules/**/*.routes.ts", "./src/api.routes.ts"],
};
