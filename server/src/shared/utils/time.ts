const UNITS: Record<string, number> = {
  s: 1_000,
  m: 60 * 1_000,
  h: 60 * 60 * 1_000,
  d: 24 * 60 * 60 * 1_000,
};

/**
 * Parse a compact duration string (e.g. "15m", "7d", "1h") to milliseconds.
 * Supported units: s · m · h · d
 */
export function parseExpiry(expiry: string): number {
  const match = expiry.match(/^(\d+)([smhd])$/);
  if (!match || !match[1] || !match[2]) {
    throw new Error(`Invalid expiry format: "${expiry}"`);
  }

  const multiplier = UNITS[match[2]];
  if (!multiplier) {
    throw new Error(`Invalid time unit: "${match[2]}"`);
  }

  return parseInt(match[1], 10) * multiplier;
}
