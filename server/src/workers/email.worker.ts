/**
 * Email Worker
 *
 * Runs as a separate process: `pnpm worker:email`
 * Picks up jobs from the "email" BullMQ queue and sends transactional emails.
 */
import { Worker, type Job } from "bullmq";
import nodemailer from "nodemailer";
import { redisConnection } from "../shared/lib/redis.js";
import { logger } from "../shared/lib/logger.js";
import { env } from "../config/env.js";
import type {
  EmailJobData,
  EmailJobName,
  PropertyCreatedHostJob,
  BookingCreatedGuestJob,
  BookingCancelledGuestJob,
  BookingCancelledHostJob,
} from "../shared/queues/email.queue.js";

// ---------------------------------------------------------------------------
// Transporter
// ---------------------------------------------------------------------------
const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  ...(env.SMTP_USER && {
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  }),
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
async function sendPropertyCreatedHost(
  data: PropertyCreatedHostJob,
): Promise<void> {
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: data.ownerEmail,
    subject: `Your listing "${data.propertyTitle}" is live! 🎉`,
    text: [
      `Hi ${data.ownerFirstName},`,
      "",
      `Great news — your property "${data.propertyTitle}" has been published and is now visible to guests.`,
      "",
      `Property ID: ${data.propertyId}`,
      "",
      "If you have any questions, reply to this email.",
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.ownerFirstName},</p>
      <p>Great news — your property <strong>${data.propertyTitle}</strong> has been published and is now visible to guests.</p>
      <p style="color:#888;font-size:12px">Property ID: ${data.propertyId}</p>
      <p>If you have any questions, reply to this email.</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendBookingCreatedGuest(
  data: BookingCreatedGuestJob,
): Promise<void> {
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: data.guestEmail,
    subject: `Booking confirmed — ${data.propertyTitle} ✅`,
    text: [
      `Hi ${data.guestFirstName},`,
      "",
      `Your booking for "${data.propertyTitle}" in ${data.propertyCity} has been received.`,
      "",
      `Check-in:  ${data.checkIn}`,
      `Check-out: ${data.checkOut}`,
      `Nights:    ${data.nights}`,
      `Guests:    ${data.guests}`,
      `Total:     $${data.totalPrice.toFixed(2)}`,
      "",
      `Booking ID: ${data.bookingId}`,
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.guestFirstName},</p>
      <p>Your booking for <strong>${data.propertyTitle}</strong> in ${data.propertyCity} has been received.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Check-in</td><td>${data.checkIn}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Check-out</td><td>${data.checkOut}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Nights</td><td>${data.nights}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Guests</td><td>${data.guests}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Total</td><td><strong>$${data.totalPrice.toFixed(2)}</strong></td></tr>
      </table>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendBookingCancelledGuest(
  data: BookingCancelledGuestJob,
): Promise<void> {
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: data.guestEmail,
    subject: `Booking cancelled — ${data.propertyTitle}`,
    text: [
      `Hi ${data.guestFirstName},`,
      "",
      `Your booking for "${data.propertyTitle}" has been cancelled.`,
      "",
      `Original dates: ${data.checkIn} — ${data.checkOut}`,
      `Booking ID: ${data.bookingId}`,
      "",
      "If this was unintentional, please create a new booking.",
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.guestFirstName},</p>
      <p>Your booking for <strong>${data.propertyTitle}</strong> has been cancelled.</p>
      <p>Original dates: ${data.checkIn} — ${data.checkOut}</p>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}</p>
      <p>If this was unintentional, please create a new booking.</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendBookingCancelledHost(
  data: BookingCancelledHostJob,
): Promise<void> {
  await transporter.sendMail({
    from: env.EMAIL_FROM,
    to: data.hostEmail,
    subject: `Booking cancelled — ${data.propertyTitle}`,
    text: [
      `Hi ${data.hostFirstName},`,
      "",
      `A booking for "${data.propertyTitle}" has been cancelled by the guest.`,
      "",
      `Guest: ${data.guestFirstName} ${data.guestLastName}`,
      `Dates: ${data.checkIn} — ${data.checkOut}`,
      `Booking ID: ${data.bookingId}`,
      "",
      "The dates are now available for new bookings.",
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.hostFirstName},</p>
      <p>A booking for <strong>${data.propertyTitle}</strong> has been cancelled by the guest.</p>
      <p>Guest: ${data.guestFirstName} ${data.guestLastName}</p>
      <p>Dates: ${data.checkIn} — ${data.checkOut}</p>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}</p>
      <p>The dates are now available for new bookings.</p>
      <p>— The Booking Service team</p>
    `,
  });
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------
async function processEmail(
  job: Job<EmailJobData["data"], void, EmailJobName>,
): Promise<void> {
  logger.info({ jobId: job.id, name: job.name }, "Processing email job");

  switch (job.name) {
    case "property-created-host":
      await sendPropertyCreatedHost(job.data as PropertyCreatedHostJob);
      break;
    case "booking-created-guest":
      await sendBookingCreatedGuest(job.data as BookingCreatedGuestJob);
      break;
    case "booking-cancelled-guest":
      await sendBookingCancelledGuest(job.data as BookingCancelledGuestJob);
      break;
    case "booking-cancelled-host":
      await sendBookingCancelledHost(job.data as BookingCancelledHostJob);
      break;
    default:
      logger.warn({ name: job.name }, "Unknown email job name — skipping");
  }
}

const worker = new Worker<EmailJobData["data"], void, EmailJobName>(
  "email",
  processEmail,
  { connection: redisConnection, concurrency: 10 },
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, name: job.name }, "Email job completed");
});

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, name: job?.name, error }, "Email job failed");
});

logger.info("Email worker started");
