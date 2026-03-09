import { Queue } from "bullmq";
import { redisConnection } from "../lib/redis.js";

export type EmailJobName = "property-created-host";

export interface PropertyCreatedHostJob {
  ownerEmail: string;
  ownerFirstName: string;
  propertyId: string;
  propertyTitle: string;
}

/** Discriminated union — extend with new job names as needed. */
export type EmailJobData = {
  name: "property-created-host";
  data: PropertyCreatedHostJob;
};

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
