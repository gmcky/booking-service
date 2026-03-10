import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export type EmailJobName =
  | "property-created-host"
  | "booking-created-guest"
  | "booking-cancelled-guest"
  | "booking-cancelled-host"
  | "review-received-host";

export interface PropertyCreatedHostJob {
  ownerEmail: string;
  ownerFirstName: string;
  propertyId: string;
  propertyTitle: string;
}

export interface BookingCreatedGuestJob {
  bookingId: string;
  guestEmail: string;
  guestFirstName: string;
  propertyTitle: string;
  propertyCity: string;
  checkIn: string; // ISO string
  checkOut: string; // ISO string
  nights: number;
  guests: number;
  totalPrice: number;
}

export interface BookingCancelledGuestJob {
  bookingId: string;
  guestEmail: string;
  guestFirstName: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
}

export interface BookingCancelledHostJob {
  bookingId: string;
  hostEmail: string;
  hostFirstName: string;
  propertyTitle: string;
  guestFirstName: string;
  guestLastName: string;
  checkIn: string;
  checkOut: string;
}

export interface ReviewReceivedHostJob {
  reviewId: string;
  hostEmail: string;
  hostFirstName: string;
  propertyTitle: string;
  guestFirstName: string;
  guestLastName: string;
  rating: number;
  comment: string | null;
}

/** Discriminated union — extend with new job names as needed. */
export type EmailJobData =
  | { name: "property-created-host"; data: PropertyCreatedHostJob }
  | { name: "booking-created-guest"; data: BookingCreatedGuestJob }
  | { name: "booking-cancelled-guest"; data: BookingCancelledGuestJob }
  | { name: "booking-cancelled-host"; data: BookingCancelledHostJob }
  | { name: "review-received-host"; data: ReviewReceivedHostJob };

export const emailQueue = new Queue<EmailJobData["data"], void, EmailJobName>(
  "email",
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 10_000 },
      removeOnComplete: 200,
      removeOnFail: 500,
    },
  },
);
