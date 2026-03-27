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
    // Single query with JOIN — replaces N+1 pattern
    const result = await query(
      `SELECT DISTINCT ON (es.prospect_id)
         es.prospect_id,
         es.subject,
         es.created_at AS sent_at,
         es.opened_at,
         es.clicked_at,
         EXISTS(
           SELECT 1 FROM email_events ee
           WHERE ee.email_send_id = es.id
             AND ee.event_type IN ('email.bounced', 'email.complained')
         ) AS bounced
       FROM email_sends es
       WHERE es.prospect_id = ANY($1)
       ORDER BY es.prospect_id, es.created_at DESC`,
      [prospectIds]
    );

    const stats: Record<string, {
      sent_at: string;
      opened_at: string | null;
      clicked_at: string | null;
      bounced: boolean;
      subject: string;
    }> = {};

    for (const row of result.rows) {
      stats[row.prospect_id] = {
        sent_at: row.sent_at,
        opened_at: row.opened_at,
        clicked_at: row.clicked_at,
        bounced: row.bounced,
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
