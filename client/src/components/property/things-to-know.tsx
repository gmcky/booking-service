import type { PropertyDetail } from "@/lib/api/properties";

// Mirrors server/src/modules/payments/payment.helpers.ts REFUND_POLICY —
// keep these two in sync if the refund tiers ever change.
const FULL_REFUND_HOURS = 48;
const PARTIAL_REFUND_HOURS = 24;

function formatCutoff(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ThingsToKnow({
  property,
  checkIn,
}: {
  property: PropertyDetail;
  checkIn?: Date;
}) {
  const houseRules = [
    property.checkInTime ? `Check-in after ${property.checkInTime}` : null,
    property.checkOutTime ? `Checkout before ${property.checkOutTime}` : null,
    `${property.maxGuests} guests maximum`,
    property.petsAllowed ? "Pets allowed" : "No pets",
    property.infantsAllowed ? "Suitable for infants (under 2)" : "Not suitable for infants",
  ].filter((r): r is string => r !== null);

  const safety = [
    property.amenities.includes("SMOKE_ALARM") ? "Smoke alarm" : "No smoke alarm",
    property.amenities.includes("CARBON_MONOXIDE_ALARM")
      ? "Carbon monoxide alarm"
      : "No carbon monoxide alarm",
  ];

  const cancellation = checkIn
    ? [
        `Free cancellation before ${formatCutoff(
          new Date(checkIn.getTime() - FULL_REFUND_HOURS * 60 * 60 * 1000),
        )}`,
        `50% refund before ${formatCutoff(
          new Date(checkIn.getTime() - PARTIAL_REFUND_HOURS * 60 * 60 * 1000),
        )}`,
        "After that, the reservation is non-refundable",
      ]
    : [
        `Free cancellation until ${FULL_REFUND_HOURS} hours before check-in`,
        `50% refund until ${PARTIAL_REFUND_HOURS} hours before check-in`,
        "No refund after that",
      ];

  return (
    <div id="things-to-know" className="scroll-mt-32 border-t border-border py-6">
      <h2 className="mb-[18px] text-[19px] font-semibold tracking-tight">Things to know</h2>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
        <ThingsColumn title="House rules" rows={houseRules} />
        <ThingsColumn title="Safety & property" rows={safety} />
        <ThingsColumn title="Cancellation policy" rows={cancellation} />
      </div>
    </div>
  );
}

function ThingsColumn({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div>
      <h3 className="mb-2.5 text-sm font-semibold">{title}</h3>
      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
        {rows.map((row) => (
          <li key={row}>{row}</li>
        ))}
      </ul>
    </div>
  );
}
