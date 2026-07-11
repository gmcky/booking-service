import type { Metadata } from "next";
import { HostProfileView } from "@/components/host/host-profile-view";
import { BASE_URL } from "@/lib/api/base-url";
import type { PublicUserProfile } from "@/lib/api/users";

// Plain fetch, not userApi: the api client's middleware reads the "use
// client" auth store on every request, which throws in this server-only
// context. The endpoint is public, no auth needed.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const fallback: Metadata = { title: "Host" };
  try {
    const res = await fetch(`${BASE_URL}/users/${encodeURIComponent(id)}`);
    if (!res.ok) return fallback;
    const host = (await res.json()) as PublicUserProfile;
    return { title: host.firstName };
  } catch (err) {
    console.error("generateMetadata: host fetch failed", err);
    return fallback;
  }
}

export default async function HostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <HostProfileView id={id} />;
}
