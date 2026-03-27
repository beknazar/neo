import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function GET(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const prospectId = searchParams.get("prospectId");

  if (!prospectId) {
    return NextResponse.json(
      { error: "prospectId is required" },
      { status: 400 }
    );
  }

  try {
    // Get most recent email send for this prospect
    const sendResult = await query(
      `SELECT id, subject, created_at AS sent_at, opened_at, clicked_at
       FROM email_sends
       WHERE prospect_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [prospectId]
    );

    if (sendResult.rows.length === 0) {
      return NextResponse.json(
        { error: "No email sends found for this prospect" },
        { status: 404 }
      );
    }

    const send = sendResult.rows[0];

    // Check for bounce event
    const bounceResult = await query(
      `SELECT id FROM email_events
       WHERE email_send_id = $1
         AND event_type IN ('email.bounced', 'email.complained')
       LIMIT 1`,
      [send.id]
    );

    return NextResponse.json({
      sent_at: send.sent_at,
      opened_at: send.opened_at,
      clicked_at: send.clicked_at,
      bounced: bounceResult.rows.length > 0,
      subject: send.subject,
    });
  } catch (error) {
    console.error("Email stats error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
