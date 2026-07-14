import { HostBookingDetailView } from "@/components/host/host-booking-detail-view";

export default async function HostBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HostBookingDetailView id={id} />;
}
