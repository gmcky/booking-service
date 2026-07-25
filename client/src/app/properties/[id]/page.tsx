import type { Metadata } from "next";
import { PropertyDetailView } from "@/components/property/property-detail-view";
import { BASE_URL } from "@/lib/api/base-url";
import { photoUrl } from "@/lib/utils/photo";
import type { PropertyDetail } from "@/lib/api/properties";

// Plain fetch, not propertyApi: the api client's middleware reads the
// "use client" auth store on every request, which throws in this
// server-only context. The endpoint is public, no auth needed.
//
// Cached, because nothing renders until it resolves: metadata blocks the
// response, so an uncached call means every visit waits on a round trip to
// the API before the page's own skeleton can even appear.
const METADATA_REVALIDATE_SECONDS = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const fallback: Metadata = { title: "Property" };
  try {
    const res = await fetch(`${BASE_URL}/properties/${encodeURIComponent(id)}`, {
      next: { revalidate: METADATA_REVALIDATE_SECONDS },
    });
    if (!res.ok) return fallback;
    const property = (await res.json()) as PropertyDetail;
    const description = property.description.slice(0, 160);
    const image = property.images[0] ? photoUrl(property.images[0]) : undefined;
    return {
      title: property.title,
      description,
      openGraph: {
        title: property.title,
        description,
        type: "website",
        images: image ? [image] : undefined,
      },
    };
  } catch (err) {
    console.error("generateMetadata: property fetch failed", err);
    return fallback;
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
