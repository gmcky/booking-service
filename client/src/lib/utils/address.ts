/** "Khreshchatyk St 22, apt. 5" — house and apartment are optional. */
export function formatStreetAddress(property: {
  street: string;
  houseNumber?: string | null;
  apartment?: string | null;
}): string {
  const streetLine = [property.street, property.houseNumber].filter(Boolean).join(" ");
  return property.apartment ? `${streetLine}, apt. ${property.apartment}` : streetLine;
}
