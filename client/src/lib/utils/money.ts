const wholePriceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const centPriceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Prisma Decimal fields are serialized as strings over the wire. */
export function parseDecimal(value: string): number {
  return Number(value);
}

export function formatPrice(value: string | number): string {
  const amount = typeof value === "string" ? parseDecimal(value) : value;
  return Number.isInteger(amount)
    ? wholePriceFormatter.format(amount)
    : centPriceFormatter.format(amount);
}

export function formatRating(value: string | number | null): string | null {
  if (value === null) return null;
  const amount = typeof value === "string" ? parseDecimal(value) : value;
  return amount.toFixed(2);
}
