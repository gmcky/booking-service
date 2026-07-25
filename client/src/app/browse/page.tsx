import type { Metadata } from "next";
import { BrowseView } from "@/components/property/browse-view";

export const metadata: Metadata = {
  title: "Browse stays",
  description: "Search unique places to stay by city, dates, price, and amenities.",
};

export default function BrowsePage() {
  return <BrowseView />;
}
