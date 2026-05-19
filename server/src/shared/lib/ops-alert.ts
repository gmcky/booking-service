import { env } from "../../config/env.js";
import { logger } from "./logger.js";

const ALERT_TIMEOUT_MS = 5000;

function trimMessage(message: string, maxLength: number): string {
  return message.length > maxLength ? `${message.slice(0, maxLength - 1)}…` : message;
}

export async function sendOpsAlert(params: {
  title: string;
  message: string;
  context?: Record<string, unknown>;
}) {
  const webhookUrl = env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    logger.warn(
      {
        title: params.title,
      },
      "ALERT_WEBHOOK_URL is not configured; skipping ops alert",
    );
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ALERT_TIMEOUT_MS);

  try {
    const payload = {
      title: trimMessage(params.title, 180),
      message: trimMessage(params.message, 2000),
      context: params.context ?? {},
      sentAt: new Date().toISOString(),
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const responseText = await response.text();
      logger.error(
        {
          status: response.status,
          body: trimMessage(responseText, 500),
          title: params.title,
        },
        "Ops alert webhook request failed",
      );
    }
  } catch (error) {
    logger.error({ error, title: params.title }, "Failed to send ops alert");
  } finally {
    clearTimeout(timeout);
  }
}
