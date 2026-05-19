import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export type EmailJobName =
  | "property-created-host"
  | "booking-created-guest"
  | "booking-created-host"
  | "booking-cancelled-guest"
  | "booking-cancelled-host"
  | "review-received-host"
  | "review-reported-admin"
  | "payment-success-guest"
  | "payment-success-host"
  | "refund-requested-admin"
  | "refund-processed-guest"
  | "refund-processed-host"
  | "email-change-otp"
  | "email-changed-notification"
  | "password-changed-notification"
  | "account-deleted-notification";

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
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
  totalPrice: number;
}

export interface BookingCreatedHostJob {
  bookingId: string;
  hostEmail: string;
  hostFirstName: string;
  guestFirstName: string;
  guestLastName: string;
  propertyTitle: string;
  propertyCity: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  guests: number;
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

export interface ReviewReportedAdminJob {
  adminEmail: string;
  adminFirstName: string;
  reviewId: string;
  propertyTitle: string;
  reporterFullName: string;
  reporterEmail: string;
  reason: string;
}

export interface PaymentSuccessGuestJob {
  paymentId: string;
  bookingId: string;
  guestEmail: string;
  guestFirstName: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  amountPaid: number;
  currency: string;
}

export interface PaymentSuccessHostJob {
  paymentId: string;
  bookingId: string;
  hostEmail: string;
  hostFirstName: string;
  propertyTitle: string;
  guestFirstName: string;
  guestLastName: string;
  checkIn: string;
  checkOut: string;
  amountPaid: number;
  currency: string;
}

export interface RefundRequestedAdminJob {
  adminEmail: string;
  adminFirstName: string;
  paymentId: string;
  bookingId: string;
  guestFullName: string;
  guestEmail: string;
  propertyTitle: string;
  checkIn: string;
  checkOut: string;
  refundPercent: number;
  refundAmount: number;
  reason: string | null;
}

export interface RefundProcessedGuestJob {
  paymentId: string;
  bookingId: string;
  guestEmail: string;
  guestFirstName: string;
  propertyTitle: string;
  isApproved: boolean;
  reason: string | null;
}

export interface RefundProcessedHostJob {
  paymentId: string;
  bookingId: string;
  hostEmail: string;
  hostFirstName: string;
  propertyTitle: string;
  guestFirstName: string;
  guestLastName: string;
  checkIn: string;
  checkOut: string;
  refundPercent: number;
  refundedAmount: number;
  totalAmount: number;
  currency: string;
}

export interface EmailChangeOtpJob {
  /** The new email that the user wants to switch to */
  newEmail: string;
  firstName: string;
  /** 6-digit OTP code */
  otp: string;
  /** Minutes until the OTP expires */
  expiresInMinutes: number;
}

export interface EmailChangedNotificationJob {
  /** The old (current) email — notify the real owner */
  oldEmail: string;
  firstName: string;
  /** The new email that was confirmed */
  newEmail: string;
}

export interface PasswordChangedNotificationJob {
  email: string;
  firstName: string;
  changedAtIso: string;
}

export interface AccountDeletedNotificationJob {
  email: string;
  firstName: string;
  deletedAtIso: string;
}

export type EmailJobData =
  | { name: "property-created-host"; data: PropertyCreatedHostJob }
  | { name: "booking-created-guest"; data: BookingCreatedGuestJob }
  | { name: "booking-created-host"; data: BookingCreatedHostJob }
  | { name: "booking-cancelled-guest"; data: BookingCancelledGuestJob }
  | { name: "booking-cancelled-host"; data: BookingCancelledHostJob }
  | { name: "review-received-host"; data: ReviewReceivedHostJob }
  | { name: "review-reported-admin"; data: ReviewReportedAdminJob }
  | { name: "payment-success-guest"; data: PaymentSuccessGuestJob }
  | { name: "payment-success-host"; data: PaymentSuccessHostJob }
  | { name: "refund-requested-admin"; data: RefundRequestedAdminJob }
  | { name: "refund-processed-guest"; data: RefundProcessedGuestJob }
  | { name: "refund-processed-host"; data: RefundProcessedHostJob }
  | { name: "email-change-otp"; data: EmailChangeOtpJob }
  | { name: "email-changed-notification"; data: EmailChangedNotificationJob }
  | {
      name: "password-changed-notification";
      data: PasswordChangedNotificationJob;
    }
  | {
      name: "account-deleted-notification";
      data: AccountDeletedNotificationJob;
    };

export const emailQueue = new Queue<EmailJobData["data"], void, EmailJobName>("email", {
  connection: redisConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 10_000 },
    removeOnComplete: 200,
    removeOnFail: 500,
  },
});
