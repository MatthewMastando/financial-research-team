/** External-channel seam. No channel is enabled or sends messages in v1. */
export type ResearchNotification = {
  alert_id: string;
  title: string;
  severity: string;
  report_ids: string[];
  idempotency_key: string;
};
export type DeliveryResult = {
  status: "disabled" | "delivered" | "retryable" | "failed";
  provider_receipt?: string;
};
export interface NotificationChannel {
  readonly name: string;
  readonly enabled: boolean;
  deliver(notification: ResearchNotification): Promise<DeliveryResult>;
}
export class DisabledNotificationChannel implements NotificationChannel {
  readonly name = "disabled";
  readonly enabled = false;
  async deliver(): Promise<DeliveryResult> {
    return { status: "disabled" };
  }
}
