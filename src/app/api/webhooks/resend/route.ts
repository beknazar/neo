import { NextResponse } from "next/server";
import { saveEmailEvent, getEmailSendByResendId } from "@/lib/db";

/**
 * Resend webhook handler for email event tracking.
 * Events: email.sent, email.delivered, email.opened, email.clicked, email.bounced, email.complained
 */
export async function POST(request: Request) {
  try {
    // Verify webhook secret
    const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get("svix-signature");
      if (!signature) {
        return NextResponse.json({ error: "Missing signature" }, { status: 401 });
      }
      // For production, use @svix/webhook to verify. For now, check secret presence.
    }

    const payload = await request.json();
    const eventType = payload.type; // e.g. "email.opened"
    const data = payload.data;

    if (!eventType || !data) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // Find the email_send record by Resend message ID
    const resendId = data.email_id || data.id;
    let emailSendId: string | undefined;
    let campaignId: string | undefined;

    if (resendId) {
      const emailSend = await getEmailSendByResendId(resendId);
      if (emailSend) {
        emailSendId = emailSend.id;
        campaignId = emailSend.campaign_id;
      }
    }

    // Log the event
    await saveEmailEvent({
      emailSendId,
      campaignId,
      eventType,
      metadata: data,
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Resend webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
