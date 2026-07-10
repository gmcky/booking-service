import { BookingDetailView } from "@/components/bookings/booking-detail-view";

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BookingDetailView id={id} />;
}
