/**
 * Email Worker
 *
 * Runs in a dedicated process via `pnpm worker:email`.
 * Consumes jobs from the `email` BullMQ queue and dispatches transactional emails.
 */
import "../instrument.js";
import { Worker, type Job } from "bullmq";
import nodemailer, { type SendMailOptions } from "nodemailer";
import { redisConnection } from "../shared/lib/redis.js";
import { logger } from "../shared/lib/logger.js";
import { env } from "../config/env.js";
import { prisma } from "../shared/lib/prisma.js";
import { isSeedEmail } from "../shared/utils/seed-email.js";
import type {
  EmailJobData,
  EmailJobName,
  PropertyCreatedHostJob,
  BookingCreatedGuestJob,
  BookingCreatedHostJob,
  BookingCancelledGuestJob,
  BookingCancelledHostJob,
  ReviewReceivedHostJob,
  ReviewReportedAdminJob,
  PaymentSuccessGuestJob,
  PaymentSuccessHostJob,
  RefundRequestedAdminJob,
  RefundProcessedGuestJob,
  RefundProcessedHostJob,
  HostCancelRequestedGuestJob,
  HostCancelRequestedAdminJob,
  HostCancelApprovedGuestJob,
  HostCancelRejectedHostJob,
  HostDeclinedGuestJob,
  EmailChangeOtpJob,
  EmailChangedNotificationJob,
  PasswordChangedNotificationJob,
  AccountDeletedNotificationJob,
  VerifyEmailJob,
} from "../shared/queues/email.queue.js";

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  ...(env.SMTP_USER && {
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
  }),
});

/**
 * Single choke point for every outbound email. Two guards sit in front of
 * the real transporter call:
 *  - seed/demo recipients never get mailed in production (they're fixture
 *    data, not real inboxes).
 *  - outside the verification email itself, a recipient who exists in our
 *    DB but hasn't verified their email is skipped (defense in depth —
 *    routes should already gate on this, this is the belt-and-suspenders
 *    check at the point mail actually leaves the building).
 */
async function sendMail(jobName: EmailJobName, options: SendMailOptions): Promise<void> {
  const to = typeof options.to === "string" ? options.to : undefined;

  if (env.NODE_ENV === "production" && to && isSeedEmail(to)) {
    logger.info({ to, subject: options.subject }, "Skipping email send: seed/demo recipient");
    return;
  }

  if (jobName !== "verify-email" && to) {
    const recipient = await prisma.user.findUnique({
      where: { email: to },
      select: { emailVerifiedAt: true, isDeleted: true },
    });

    if (recipient && recipient.emailVerifiedAt === null) {
      logger.info(
        { to, subject: options.subject, jobName },
        "Skipping email send: recipient has not verified their email",
      );
      return;
    }
  }

  await transporter.sendMail(options);
}

async function sendPropertyCreatedHost(data: PropertyCreatedHostJob): Promise<void> {
  await sendMail("property-created-host", {
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

async function sendBookingCreatedGuest(data: BookingCreatedGuestJob): Promise<void> {
  await sendMail("booking-created-guest", {
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

async function sendBookingCreatedHost(data: BookingCreatedHostJob): Promise<void> {
  await sendMail("booking-created-host", {
    from: env.EMAIL_FROM,
    to: data.hostEmail,
    subject: `New booking request — ${data.propertyTitle}`,
    text: [
      `Hi ${data.hostFirstName},`,
      "",
      `A guest booked your property \"${data.propertyTitle}\" in ${data.propertyCity}.`,
      "",
      `Guest:     ${data.guestFirstName} ${data.guestLastName}`,
      `Check-in:  ${data.checkIn}`,
      `Check-out: ${data.checkOut}`,
      `Nights:    ${data.nights}`,
      `Guests:    ${data.guests}`,
      `Booking ID:${data.bookingId}`,
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.hostFirstName},</p>
      <p>A guest booked your property <strong>${data.propertyTitle}</strong> in ${data.propertyCity}.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Guest</td><td>${data.guestFirstName} ${data.guestLastName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Check-in</td><td>${data.checkIn}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Check-out</td><td>${data.checkOut}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Nights</td><td>${data.nights}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Guests</td><td>${data.guests}</td></tr>
      </table>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendBookingCancelledGuest(data: BookingCancelledGuestJob): Promise<void> {
  await sendMail("booking-cancelled-guest", {
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

async function sendBookingCancelledHost(data: BookingCancelledHostJob): Promise<void> {
  await sendMail("booking-cancelled-host", {
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

async function sendReviewReceivedHost(data: ReviewReceivedHostJob): Promise<void> {
  await sendMail("review-received-host", {
    from: env.EMAIL_FROM,
    to: data.hostEmail,
    subject: `New review for ${data.propertyTitle}`,
    text: [
      `Hi ${data.hostFirstName},`,
      "",
      `You received a new ${data.rating}-star review for \"${data.propertyTitle}\".`,
      `Guest: ${data.guestFirstName} ${data.guestLastName}`,
      ...(data.comment ? ["", `Comment: ${data.comment}`] : []),
      "",
      `Review ID: ${data.reviewId}`,
      "",
      "- The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.hostFirstName},</p>
      <p>You received a new <strong>${data.rating}-star</strong> review for <strong>${data.propertyTitle}</strong>.</p>
      <p>Guest: ${data.guestFirstName} ${data.guestLastName}</p>
      ${data.comment ? `<p><strong>Comment:</strong> ${data.comment}</p>` : ""}
      <p style="color:#888;font-size:12px">Review ID: ${data.reviewId}</p>
      <p>- The Booking Service team</p>
    `,
  });
}

async function sendReviewReportedAdmin(data: ReviewReportedAdminJob): Promise<void> {
  await sendMail("review-reported-admin", {
    from: env.EMAIL_FROM,
    to: data.adminEmail,
    subject: `Review reported - ${data.propertyTitle}`,
    text: [
      `Hi ${data.adminFirstName},`,
      "",
      "A review has been reported and needs moderation.",
      "",
      `Property: ${data.propertyTitle}`,
      `Review ID: ${data.reviewId}`,
      `Reported by: ${data.reporterFullName} (${data.reporterEmail})`,
      `Reason: ${data.reason}`,
      "",
      "- The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.adminFirstName},</p>
      <p>A review has been reported and needs moderation.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Property</td><td>${data.propertyTitle}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Review ID</td><td>${data.reviewId}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Reported by</td><td>${data.reporterFullName} (${data.reporterEmail})</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Reason</td><td>${data.reason}</td></tr>
      </table>
      <p>- The Booking Service team</p>
    `,
  });
}

async function sendPaymentSuccessGuest(data: PaymentSuccessGuestJob): Promise<void> {
  await sendMail("payment-success-guest", {
    from: env.EMAIL_FROM,
    to: data.guestEmail,
    subject: `Payment successful — ${data.propertyTitle} ✅`,
    text: [
      `Hi ${data.guestFirstName},`,
      "",
      `We received your payment for \"${data.propertyTitle}\".`,
      "",
      `Amount paid: ${data.amountPaid.toFixed(2)} ${data.currency}`,
      `Check-in:    ${data.checkIn}`,
      `Check-out:   ${data.checkOut}`,
      `Booking ID:  ${data.bookingId}`,
      `Payment ID:  ${data.paymentId}`,
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.guestFirstName},</p>
      <p>We received your payment for <strong>${data.propertyTitle}</strong>.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Amount paid</td><td><strong>${data.amountPaid.toFixed(2)} ${data.currency}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Check-in</td><td>${data.checkIn}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Check-out</td><td>${data.checkOut}</td></tr>
      </table>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}<br/>Payment ID: ${data.paymentId}</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendPaymentSuccessHost(data: PaymentSuccessHostJob): Promise<void> {
  await sendMail("payment-success-host", {
    from: env.EMAIL_FROM,
    to: data.hostEmail,
    subject: `Payment received — ${data.propertyTitle} ✅`,
    text: [
      `Hi ${data.hostFirstName},`,
      "",
      `Payment for booking \"${data.propertyTitle}\" has been confirmed.`,
      "",
      `Guest:      ${data.guestFirstName} ${data.guestLastName}`,
      `Amount:     ${data.amountPaid.toFixed(2)} ${data.currency}`,
      `Check-in:   ${data.checkIn}`,
      `Check-out:  ${data.checkOut}`,
      `Booking ID: ${data.bookingId}`,
      `Payment ID: ${data.paymentId}`,
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.hostFirstName},</p>
      <p>Payment for booking <strong>${data.propertyTitle}</strong> has been confirmed.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Guest</td><td>${data.guestFirstName} ${data.guestLastName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Amount</td><td><strong>${data.amountPaid.toFixed(2)} ${data.currency}</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Check-in</td><td>${data.checkIn}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Check-out</td><td>${data.checkOut}</td></tr>
      </table>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}<br/>Payment ID: ${data.paymentId}</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendRefundRequestedAdmin(data: RefundRequestedAdminJob): Promise<void> {
  await sendMail("refund-requested-admin", {
    from: env.EMAIL_FROM,
    to: data.adminEmail,
    subject: `Refund request received — Booking ${data.bookingId}`,
    text: [
      `Hi ${data.adminFirstName},`,
      "",
      "A guest submitted a refund request.",
      "",
      `Guest: ${data.guestFullName} (${data.guestEmail})`,
      `Property: ${data.propertyTitle}`,
      `Dates: ${data.checkIn} — ${data.checkOut}`,
      `Requested refund: ${data.refundPercent}% (${data.refundAmount.toFixed(2)} USD)`,
      `Reason: ${data.reason ?? "Not provided"}`,
      `Booking ID: ${data.bookingId}`,
      `Payment ID: ${data.paymentId}`,
      "",
      "Please review and process this request in the admin panel.",
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.adminFirstName},</p>
      <p>A guest submitted a refund request.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Guest</td><td>${data.guestFullName} (${data.guestEmail})</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Property</td><td>${data.propertyTitle}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Dates</td><td>${data.checkIn} — ${data.checkOut}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Requested refund</td><td><strong>${data.refundPercent}% (${data.refundAmount.toFixed(2)} USD)</strong></td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Reason</td><td>${data.reason ?? "Not provided"}</td></tr>
      </table>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}<br/>Payment ID: ${data.paymentId}</p>
      <p>Please review and process this request in the admin panel.</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendRefundProcessedGuest(data: RefundProcessedGuestJob): Promise<void> {
  const decision = data.isApproved ? "approved" : "rejected";
  const decisionLabel = data.isApproved ? "Approved" : "Rejected";

  await sendMail("refund-processed-guest", {
    from: env.EMAIL_FROM,
    to: data.guestEmail,
    subject: `Refund ${decision} — ${data.propertyTitle}`,
    text: [
      `Hi ${data.guestFirstName},`,
      "",
      `Your refund request for \"${data.propertyTitle}\" was ${decision}.`,
      ...(data.reason ? ["", `Reason: ${data.reason}`] : []),
      "",
      `Booking ID: ${data.bookingId}`,
      `Payment ID: ${data.paymentId}`,
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.guestFirstName},</p>
      <p>Your refund request for <strong>${data.propertyTitle}</strong> was <strong>${decision}</strong>.</p>
      ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ""}
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}<br/>Payment ID: ${data.paymentId}</p>
      <p>— The Booking Service team</p>
    `,
    headers: {
      "X-Refund-Decision": decisionLabel,
    },
  });
}

async function sendRefundProcessedHost(data: RefundProcessedHostJob): Promise<void> {
  const hostPayoutPercent = Math.max(0, 100 - data.refundPercent);
  const hostPayoutAmount = Math.max(0, data.totalAmount - data.refundedAmount);
  const payoutMessage =
    data.refundPercent >= 100
      ? "You will not receive a payout for this booking."
      : `Expected payout after refund: ${hostPayoutAmount.toFixed(2)} ${data.currency} (${hostPayoutPercent}%).`;

  await sendMail("refund-processed-host", {
    from: env.EMAIL_FROM,
    to: data.hostEmail,
    subject: `Refund processed — booking cancelled (${data.propertyTitle})`,
    text: [
      `Hi ${data.hostFirstName},`,
      "",
      `The booking for \"${data.propertyTitle}\" has been cancelled after a refund was processed.`,
      "",
      `Guest: ${data.guestFirstName} ${data.guestLastName}`,
      `Dates: ${data.checkIn} — ${data.checkOut}`,
      `Refund: ${data.refundedAmount.toFixed(2)} ${data.currency} (${data.refundPercent}%)`,
      payoutMessage,
      "",
      "The calendar dates are now available for new bookings.",
      `Booking ID: ${data.bookingId}`,
      `Payment ID: ${data.paymentId}`,
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.hostFirstName},</p>
      <p>The booking for <strong>${data.propertyTitle}</strong> has been cancelled after a refund was processed.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Guest</td><td>${data.guestFirstName} ${data.guestLastName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Dates</td><td>${data.checkIn} — ${data.checkOut}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Refund</td><td><strong>${data.refundedAmount.toFixed(2)} ${data.currency} (${data.refundPercent}%)</strong></td></tr>
      </table>
      <p>${payoutMessage}</p>
      <p>The calendar dates are now available for new bookings.</p>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}<br/>Payment ID: ${data.paymentId}</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendHostCancelRequestedGuest(data: HostCancelRequestedGuestJob): Promise<void> {
  await sendMail("host-cancel-requested-guest", {
    from: env.EMAIL_FROM,
    to: data.guestEmail,
    subject: `Your host requested to cancel — ${data.propertyTitle}`,
    text: [
      `Hi ${data.guestFirstName},`,
      "",
      `The host of "${data.propertyTitle}" has requested to cancel your booking.`,
      "",
      `Dates: ${data.checkIn} — ${data.checkOut}`,
      `Host's reason: ${data.reason}`,
      "",
      "The request is under review by our team. If it is approved, you will be",
      "refunded in full. No action is needed from you.",
      "",
      `Booking ID: ${data.bookingId}`,
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.guestFirstName},</p>
      <p>The host of <strong>${data.propertyTitle}</strong> has requested to cancel your booking.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Dates</td><td>${data.checkIn} — ${data.checkOut}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Host's reason</td><td>${data.reason}</td></tr>
      </table>
      <p>The request is under review by our team. If it is approved, you will be <strong>refunded in full</strong>. No action is needed from you.</p>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendHostCancelRequestedAdmin(data: HostCancelRequestedAdminJob): Promise<void> {
  await sendMail("host-cancel-requested-admin", {
    from: env.EMAIL_FROM,
    to: data.adminEmail,
    subject: `Host cancellation request — ${data.propertyTitle}`,
    text: [
      `Hi ${data.adminFirstName},`,
      "",
      "A host has requested to cancel a confirmed booking. Approval issues a full refund to the guest.",
      "",
      `Property: ${data.propertyTitle}`,
      `Host: ${data.hostFullName}`,
      `Guest: ${data.guestFullName}`,
      `Dates: ${data.checkIn} — ${data.checkOut}`,
      `Reason: ${data.reason}`,
      `Request ID: ${data.requestId}`,
      `Booking ID: ${data.bookingId}`,
      "",
      "Review and approve or reject this request in the admin panel.",
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.adminFirstName},</p>
      <p>A host has requested to cancel a confirmed booking. Approval issues a <strong>full refund</strong> to the guest.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Property</td><td>${data.propertyTitle}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Host</td><td>${data.hostFullName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Guest</td><td>${data.guestFullName}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Dates</td><td>${data.checkIn} — ${data.checkOut}</td></tr>
        <tr><td style="padding:4px 12px 4px 0;color:#666">Reason</td><td>${data.reason}</td></tr>
      </table>
      <p style="color:#888;font-size:12px">Request ID: ${data.requestId}<br/>Booking ID: ${data.bookingId}</p>
      <p>Review and approve or reject this request in the admin panel.</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendHostCancelApprovedGuest(data: HostCancelApprovedGuestJob): Promise<void> {
  await sendMail("host-cancel-approved-guest", {
    from: env.EMAIL_FROM,
    to: data.guestEmail,
    subject: `Booking cancelled, full refund issued — ${data.propertyTitle}`,
    text: [
      `Hi ${data.guestFirstName},`,
      "",
      `Your booking for "${data.propertyTitle}" has been cancelled at the host's request.`,
      "",
      `A full refund of ${data.refundedAmount.toFixed(2)} ${data.currency} has been issued to your`,
      "original payment method. It may take a few business days to appear.",
      "",
      `Dates: ${data.checkIn} — ${data.checkOut}`,
      `Booking ID: ${data.bookingId}`,
      "",
      "We're sorry for the disruption. The dates are free again if you'd like to rebook elsewhere.",
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.guestFirstName},</p>
      <p>Your booking for <strong>${data.propertyTitle}</strong> has been cancelled at the host's request.</p>
      <p>A <strong>full refund of ${data.refundedAmount.toFixed(2)} ${data.currency}</strong> has been issued to your original payment method. It may take a few business days to appear.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Dates</td><td>${data.checkIn} — ${data.checkOut}</td></tr>
      </table>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}</p>
      <p>We're sorry for the disruption.</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendHostCancelRejectedHost(data: HostCancelRejectedHostJob): Promise<void> {
  await sendMail("host-cancel-rejected-host", {
    from: env.EMAIL_FROM,
    to: data.hostEmail,
    subject: `Cancellation request declined — ${data.propertyTitle}`,
    text: [
      `Hi ${data.hostFirstName},`,
      "",
      `Your request to cancel the booking for "${data.propertyTitle}" was declined.`,
      ...(data.reason ? ["", `Reason: ${data.reason}`] : []),
      "",
      `Dates: ${data.checkIn} — ${data.checkOut}`,
      "The booking remains active. Contact support if you need help.",
      "",
      `Booking ID: ${data.bookingId}`,
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.hostFirstName},</p>
      <p>Your request to cancel the booking for <strong>${data.propertyTitle}</strong> was declined.</p>
      ${data.reason ? `<p><strong>Reason:</strong> ${data.reason}</p>` : ""}
      <p>Dates: ${data.checkIn} — ${data.checkOut}</p>
      <p>The booking remains active. Contact support if you need help.</p>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendHostDeclinedGuest(data: HostDeclinedGuestJob): Promise<void> {
  const refundLine =
    data.refundedAmount > 0
      ? `A full refund of ${data.refundedAmount.toFixed(2)} ${data.currency} has been issued to your original payment method. It may take a few business days to appear.`
      : "No payment had been captured, so there is nothing to refund.";

  await sendMail("host-declined-guest", {
    from: env.EMAIL_FROM,
    to: data.guestEmail,
    subject: `Reservation declined — ${data.propertyTitle}`,
    text: [
      `Hi ${data.guestFirstName},`,
      "",
      `The host was unable to accept your reservation request for "${data.propertyTitle}".`,
      "",
      `Dates: ${data.checkIn} — ${data.checkOut}`,
      refundLine,
      "",
      "The dates are free again if you'd like to book a different stay.",
      "",
      `Booking ID: ${data.bookingId}`,
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.guestFirstName},</p>
      <p>The host was unable to accept your reservation request for <strong>${data.propertyTitle}</strong>.</p>
      <table style="border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0;color:#666">Dates</td><td>${data.checkIn} — ${data.checkOut}</td></tr>
      </table>
      <p>${refundLine}</p>
      <p>The dates are free again if you'd like to book a different stay.</p>
      <p style="color:#888;font-size:12px">Booking ID: ${data.bookingId}</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendEmailChangeOtp(data: EmailChangeOtpJob): Promise<void> {
  await sendMail("email-change-otp", {
    from: env.EMAIL_FROM,
    to: data.newEmail,
    subject: `Your email change verification code — ${data.otp}`,
    text: [
      `Hi ${data.firstName},`,
      "",
      `You requested to change your account email to this address.`,
      "",
      `Your verification code is: ${data.otp}`,
      "",
      `This code expires in ${data.expiresInMinutes} minutes.`,
      "",
      "If you did not request this change, you can safely ignore this email.",
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.firstName},</p>
      <p>You requested to change your account email to this address.</p>
      <p style="font-size:28px;font-weight:bold;letter-spacing:6px;text-align:center;padding:16px 0">${data.otp}</p>
      <p style="color:#888;font-size:12px;text-align:center">Expires in ${data.expiresInMinutes} minutes</p>
      <p>If you did not request this change, you can safely ignore this email.</p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendEmailChangedNotification(data: EmailChangedNotificationJob): Promise<void> {
  await sendMail("email-changed-notification", {
    from: env.EMAIL_FROM,
    to: data.oldEmail,
    subject: `⚠️ Your account email has been changed`,
    text: [
      `Hi ${data.firstName},`,
      "",
      `The email address on your Booking Service account was successfully changed to: ${data.newEmail}`,
      "",
      "If you made this change, no further action is needed.",
      "",
      "If you did NOT request this change, your account may be compromised.",
      "Please contact our support team immediately.",
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.firstName},</p>
      <p>The email address on your Booking Service account was successfully changed to: <strong>${data.newEmail}</strong></p>
      <p>If you made this change, no further action is needed.</p>
      <p style="color:#c0392b"><strong>If you did NOT request this change, your account may be compromised. Please contact our support team immediately.</strong></p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendPasswordChangedNotification(
  data: PasswordChangedNotificationJob,
): Promise<void> {
  await sendMail("password-changed-notification", {
    from: env.EMAIL_FROM,
    to: data.email,
    subject: "Your password was changed",
    text: [
      `Hi ${data.firstName},`,
      "",
      "Your Booking Service account password was changed successfully.",
      `Changed at: ${data.changedAtIso}`,
      "",
      "If you made this change, no further action is needed.",
      "If you did NOT change your password, secure your account immediately.",
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.firstName},</p>
      <p>Your Booking Service account password was changed successfully.</p>
      <p style="color:#666">Changed at: ${data.changedAtIso}</p>
      <p>If you made this change, no further action is needed.</p>
      <p style="color:#c0392b"><strong>If you did NOT change your password, secure your account immediately.</strong></p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendAccountDeletedNotification(data: AccountDeletedNotificationJob): Promise<void> {
  await sendMail("account-deleted-notification", {
    from: env.EMAIL_FROM,
    to: data.email,
    subject: "Your account was deleted",
    text: [
      `Hi ${data.firstName},`,
      "",
      "Your Booking Service account has been deleted.",
      `Deleted at: ${data.deletedAtIso}`,
      "",
      "If you did not initiate this action, please contact support immediately.",
      "",
      "— The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.firstName},</p>
      <p>Your Booking Service account has been deleted.</p>
      <p style="color:#666">Deleted at: ${data.deletedAtIso}</p>
      <p style="color:#c0392b"><strong>If you did not initiate this action, please contact support immediately.</strong></p>
      <p>— The Booking Service team</p>
    `,
  });
}

async function sendVerifyEmail(data: VerifyEmailJob): Promise<void> {
  await sendMail("verify-email", {
    from: env.EMAIL_FROM,
    to: data.to,
    subject: "Verify your email",
    text: [
      `Hi ${data.firstName},`,
      "",
      "Please verify your email address to finish setting up your account.",
      "",
      `Verify your email: ${data.verifyUrl}`,
      "",
      "This link expires in 24 hours.",
      "",
      "If you did not create this account, you can safely ignore this email.",
      "",
      "– The Booking Service team",
    ].join("\n"),
    html: `
      <p>Hi ${data.firstName},</p>
      <p>Please verify your email address to finish setting up your account.</p>
      <p><a href="${data.verifyUrl}" style="display:inline-block;padding:10px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px">Verify email</a></p>
      <p style="color:#888;font-size:12px">Or copy this link into your browser: ${data.verifyUrl}</p>
      <p style="color:#888;font-size:12px">This link expires in 24 hours.</p>
      <p>If you did not create this account, you can safely ignore this email.</p>
      <p>– The Booking Service team</p>
    `,
  });
}

async function processEmail(job: Job<EmailJobData["data"], void, EmailJobName>): Promise<void> {
  logger.info({ jobId: job.id, name: job.name }, "Processing email job");

  switch (job.name) {
    case "property-created-host":
      await sendPropertyCreatedHost(job.data as PropertyCreatedHostJob);
      break;
    case "booking-created-guest":
      await sendBookingCreatedGuest(job.data as BookingCreatedGuestJob);
      break;
    case "booking-created-host":
      await sendBookingCreatedHost(job.data as BookingCreatedHostJob);
      break;
    case "booking-cancelled-guest":
      await sendBookingCancelledGuest(job.data as BookingCancelledGuestJob);
      break;
    case "booking-cancelled-host":
      await sendBookingCancelledHost(job.data as BookingCancelledHostJob);
      break;
    case "review-received-host":
      await sendReviewReceivedHost(job.data as ReviewReceivedHostJob);
      break;
    case "review-reported-admin":
      await sendReviewReportedAdmin(job.data as ReviewReportedAdminJob);
      break;
    case "payment-success-guest":
      await sendPaymentSuccessGuest(job.data as PaymentSuccessGuestJob);
      break;
    case "payment-success-host":
      await sendPaymentSuccessHost(job.data as PaymentSuccessHostJob);
      break;
    case "refund-requested-admin":
      await sendRefundRequestedAdmin(job.data as RefundRequestedAdminJob);
      break;
    case "refund-processed-guest":
      await sendRefundProcessedGuest(job.data as RefundProcessedGuestJob);
      break;
    case "refund-processed-host":
      await sendRefundProcessedHost(job.data as RefundProcessedHostJob);
      break;
    case "host-cancel-requested-guest":
      await sendHostCancelRequestedGuest(job.data as HostCancelRequestedGuestJob);
      break;
    case "host-cancel-requested-admin":
      await sendHostCancelRequestedAdmin(job.data as HostCancelRequestedAdminJob);
      break;
    case "host-cancel-approved-guest":
      await sendHostCancelApprovedGuest(job.data as HostCancelApprovedGuestJob);
      break;
    case "host-cancel-rejected-host":
      await sendHostCancelRejectedHost(job.data as HostCancelRejectedHostJob);
      break;
    case "host-declined-guest":
      await sendHostDeclinedGuest(job.data as HostDeclinedGuestJob);
      break;
    case "email-change-otp":
      await sendEmailChangeOtp(job.data as EmailChangeOtpJob);
      break;
    case "email-changed-notification":
      await sendEmailChangedNotification(job.data as EmailChangedNotificationJob);
      break;
    case "password-changed-notification":
      await sendPasswordChangedNotification(job.data as PasswordChangedNotificationJob);
      break;
    case "account-deleted-notification":
      await sendAccountDeletedNotification(job.data as AccountDeletedNotificationJob);
      break;
    case "verify-email":
      await sendVerifyEmail(job.data as VerifyEmailJob);
      break;
    default:
      logger.warn({ name: job.name }, "Unknown email job name — skipping");
  }
}

const worker = new Worker<EmailJobData["data"], void, EmailJobName>("email", processEmail, {
  connection: redisConnection,
  concurrency: 10,
});

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, name: job.name }, "Email job completed");
});

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, name: job?.name, error }, "Email job failed");
});

logger.info("Email worker started");
