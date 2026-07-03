import type { components } from "./schema";

export type PropertyType = components["schemas"]["PropertyType"];
export type Amenity = components["schemas"]["Amenity"];
export type PaymentStatus = components["schemas"]["PaymentStatus"];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "Payment pending",
  SUCCESS: "Payment successful",
  REFUND_PROCESSING: "Refund processing",
  REFUND_REQUESTED: "Refund requested",
  FAILED: "Payment failed",
  REFUNDED: "Refunded",
};

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  HOTEL_ROOM: "Hotel room",
  APARTMENT: "Apartment",
  HOUSE: "House",
  MEETING_ROOM: "Meeting room",
};

export const AMENITY_LABELS: Record<Amenity, string> = {
  WIFI: "Wi-Fi",
  AIR_CONDITIONING: "Air conditioning",
  HEATING: "Heating",
  KITCHEN: "Kitchen",
  WASHER: "Washer",
  DRYER: "Dryer",
  DISHWASHER: "Dishwasher",
  PARKING: "Parking",
  POOL: "Pool",
  GYM: "Gym",
  BALCONY: "Balcony",
  TERRACE: "Terrace",
  ROOFTOP_TERRACE: "Rooftop terrace",
  GARDEN: "Garden",
  BBQ: "BBQ",
  FIREPLACE: "Fireplace",
  BATHTUB: "Bathtub",
  PRIVATE_BATHROOM: "Private bathroom",
  TV: "TV",
  SMART_TV: "Smart TV",
  COFFEE_MACHINE: "Coffee machine",
  PROJECTOR: "Projector",
  STANDING_DESK: "Standing desk",
  ELEVATOR: "Elevator",
  PET_FRIENDLY: "Pet friendly",
  WHEELCHAIR_ACCESSIBLE: "Wheelchair accessible",
  SEA_VIEW: "Sea view",
  CITY_CENTRE: "City centre",
  BEACHFRONT: "Beachfront",
  KIDS_PLAY_AREA: "Kids play area",
  BIKE_INCLUDED: "Bike included",
  BIKE_RENTAL_NEARBY: "Bike rental nearby",
  COURTYARD: "Courtyard",
  CANAL_VIEW: "Canal view",
  RIVER_VIEW: "River view",
  SUN_DECK: "Sun deck",
  KAYAK: "Kayak",
  HISTORIC_BUILDING: "Historic building",
  VINYL_RECORD_PLAYER: "Vinyl record player",
  BOOKS: "Books",
};

function titleCase(value: string): string {
  const lower = value.replace(/_/g, " ").toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function typeLabel(value: string): string {
  return (PROPERTY_TYPE_LABELS as Record<string, string>)[value] ?? titleCase(value);
}

export function amenityLabel(value: string): string {
  return (AMENITY_LABELS as Record<string, string>)[value] ?? titleCase(value);
}

export function paymentStatusLabel(value: string): string {
  return (PAYMENT_STATUS_LABELS as Record<string, string>)[value] ?? titleCase(value);
}
