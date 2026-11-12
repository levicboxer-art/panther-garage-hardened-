import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchBossNotificationEmail } from "@/lib/notification-email";

/**
 * Flushes pending boss notifications without allowing email configuration or
 * provider outages to make the underlying sale/message operation fail.
 */
export async function flushBossAlertEmail() {
  try {
    return await dispatchBossNotificationEmail(createAdminClient());
  } catch {
    return { configured: false, sent: 0 };
  }
}
