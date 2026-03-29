import type { Prisma } from "@prisma/client";

/**
 * Remove undefined values from object for Prisma operations
 * This helps with exactOptionalPropertyTypes: true
 */
export function omitUndefined<T extends Record<string, any>>(
  obj: T,
): Partial<T> {
  const result: any = {};

  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }

  return result;
}

export function getMetadataObject(
  metadata: Prisma.JsonValue | null,
): Prisma.JsonObject {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Prisma.JsonObject;
  }

  return {} as Prisma.JsonObject;
}

export function getAuditObject(metadata: Prisma.JsonObject): Prisma.JsonObject {
  const raw = metadata.audit;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Prisma.JsonObject;
  }

  return {} as Prisma.JsonObject;
}

export function getStripePayloadObject(
  metadata: Prisma.JsonObject,
): Prisma.JsonObject {
  const raw = metadata.stripePayload;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Prisma.JsonObject;
  }

  return {} as Prisma.JsonObject;
}

export function toInputJsonObject(value: unknown): Prisma.InputJsonObject {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}
