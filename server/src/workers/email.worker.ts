/**
 * Email Worker
 *
 * Runs as a separate process: `pnpm worker:email`
 * Picks up jobs from the "email" BullMQ queue and sends transactional emails
 * via SMTP using nodemailer.
 *
 * Configuration (via .env):
 *   SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM
 *
 * For local development, point at Mailpit (included in docker-compose.infra.yml):
 *   SMTP_HOST=localhost  SMTP_PORT=1025
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
} from "../shared/queues/email.queue.js";

// ---------------------------------------------------------------------------
// Transporter (shared across all jobs in this process)
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
// Handlers per job name
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
    default:
      logger.warn({ name: job.name }, "Unknown email job name — skipping");
  }
}

const worker = new Worker<EmailJobData["data"], void, EmailJobName>(
  "email",
  processEmail,
  { connection: redisConnection },
);

worker.on("completed", (job) => {
  logger.info({ jobId: job.id, name: job.name }, "Email job completed");
});

worker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, name: job?.name, error }, "Email job failed");
});

logger.info("Email worker started");
