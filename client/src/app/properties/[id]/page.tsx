import type { Metadata } from "next";
import { PropertyDetailView } from "@/components/property/property-detail-view";
import { propertyApi } from "@/lib/api/properties";
import { photoUrl } from "@/lib/utils/photo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const property = await propertyApi.byId(id);
    const description = property.description.slice(0, 160);
    const image = property.images[0] ? photoUrl(property.images[0]) : undefined;
    return {
      title: `${property.title} — Booking Service`,
      description,
      openGraph: {
        title: property.title,
        description,
        type: "website",
        images: image ? [image] : undefined,
      },
    };
  } catch {
    return { title: "Property — Booking Service" };
  }
}

export default async function PropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PropertyDetailView id={id} />;
}
