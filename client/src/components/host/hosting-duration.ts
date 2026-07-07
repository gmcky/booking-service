/** Whole years since `iso`; under a year falls back to months, under a month to "New". */
export function hostingDuration(iso: string): { value: string; unit: string } {
  const started = new Date(iso).getTime();
  const months = Math.max(0, Math.floor((Date.now() - started) / (30.44 * 24 * 60 * 60 * 1000)));
  if (months >= 12) {
    const years = Math.floor(months / 12);
    return { value: String(years), unit: years === 1 ? "Year hosting" : "Years hosting" };
  }
  if (months >= 1) {
    return { value: String(months), unit: months === 1 ? "Month hosting" : "Months hosting" };
  }
  return { value: "New", unit: "Host" };
}
