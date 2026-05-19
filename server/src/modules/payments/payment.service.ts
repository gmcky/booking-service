import { PaymentIntentService } from "./payment.intent.service.js";
import { PaymentRefundService } from "./payment.refund.service.js";
import { PaymentWebhookService } from "./payment.webhook.service.js";
import { enqueueManualPayoutLifecycleJob } from "../../shared/queues/payout.queue.js";

/**
 * Facade over intent/refund/webhook services; stabilizes controller imports.
 */
export class PaymentService {
  static createIntent = PaymentIntentService.createIntent.bind(PaymentIntentService);
  static create = PaymentIntentService.create.bind(PaymentIntentService);
  static getById = PaymentIntentService.getById.bind(PaymentIntentService);
  static process = PaymentIntentService.process.bind(PaymentIntentService);

  static requestRefund = PaymentRefundService.requestRefund.bind(PaymentRefundService);
  static approveRefund = PaymentRefundService.approveRefund.bind(PaymentRefundService);
  static rejectRefund = PaymentRefundService.rejectRefund.bind(PaymentRefundService);

  static handleStripeWebhook =
    PaymentWebhookService.handleStripeWebhook.bind(PaymentWebhookService);

  static triggerPayoutLifecycle = enqueueManualPayoutLifecycleJob;
}
