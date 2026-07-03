import { PropertyEditView } from "@/components/property/property-edit-view";

export default async function EditPropertyPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <PropertyEditView id={id} />;
}
