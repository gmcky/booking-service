import type { Prisma } from "@prisma/client";

export const REFUND_POLICY = {
  autoApproveAfterDays: 7,
  fullRefundAfterHours: 48,
  partialRefundAfterHours: 24,
  partialRefundPercent: 50,
} as const;

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function toFiniteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(parsed) ? parsed : null;
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

export function calculateRefundPolicy(checkIn: Date) {
  const msUntilCheckIn = checkIn.getTime() - Date.now();
  const hoursUntilCheckIn = msUntilCheckIn / (1000 * 60 * 60);
  const daysUntilCheckIn = Math.max(0, Math.ceil(hoursUntilCheckIn / 24));
  const isAutoApprove = daysUntilCheckIn > REFUND_POLICY.autoApproveAfterDays;

  let refundPercent = 0;
  if (hoursUntilCheckIn > REFUND_POLICY.fullRefundAfterHours) {
    refundPercent = 100;
  } else if (hoursUntilCheckIn >= REFUND_POLICY.partialRefundAfterHours) {
    refundPercent = REFUND_POLICY.partialRefundPercent;
  }

  return {
    msUntilCheckIn,
    hoursUntilCheckIn,
    daysUntilCheckIn,
    refundPercent,
    isAutoApprove,
  };
}
