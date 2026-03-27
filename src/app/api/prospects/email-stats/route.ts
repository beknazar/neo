import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

/** Batch email stats: accepts comma-separated prospect IDs. */
export async function GET(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");

  if (!ids) {
    return NextResponse.json(
      { error: "ids query param is required (comma-separated)" },
      { status: 400 }
    );
  }

  const prospectIds = ids.split(",").map((id) => id.trim()).filter(Boolean);
  if (prospectIds.length === 0) {
    return NextResponse.json({ stats: {} });
  }

  try {
    // Batch fetch latest send per prospect
    // Uses id DESC as ordering (UUIDs are time-ordered or we fall back to id)
    const result = await query(
      `SELECT DISTINCT ON (es.prospect_id)
         es.prospect_id,
         es.subject,
         es.opened_at,
         es.clicked_at,
         es.id AS send_id
       FROM email_sends es
       WHERE es.prospect_id = ANY($1::text[])
       ORDER BY es.prospect_id, es.id DESC`,
      [prospectIds]
    );

    // Check bounces in one batch query
    const sendIds = result.rows.map((r: { send_id: string }) => r.send_id);
    let bouncedIds = new Set<string>();
    if (sendIds.length > 0) {
      const bounceResult = await query(
        `SELECT DISTINCT email_send_id FROM email_events
         WHERE email_send_id = ANY($1::text[])
           AND event_type IN ('email.bounced', 'email.complained')`,
        [sendIds]
      );
      bouncedIds = new Set(bounceResult.rows.map((r: { email_send_id: string }) => r.email_send_id));
    }

    const stats: Record<string, {
      sent_at: string;
      opened_at: string | null;
      clicked_at: string | null;
      bounced: boolean;
      subject: string;
    }> = {};

    for (const row of result.rows) {
      stats[row.prospect_id] = {
        sent_at: row.opened_at || row.clicked_at || new Date().toISOString(),
        opened_at: row.opened_at,
        clicked_at: row.clicked_at,
        bounced: bouncedIds.has(row.send_id),
        subject: row.subject,
      };
    }

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("Email stats error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "An unexpected error occurred" },
      { status: 500 }
    );
  }
}
