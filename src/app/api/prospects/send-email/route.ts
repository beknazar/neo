import { NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import {
  query,
  saveEmailSend,
  updateProspectStatus,
  getTotalUsers,
} from "@/lib/db";
import { generateOutreachEmail } from "@/lib/email-templates";

const execAsync = promisify(exec);

const FREE_SLOTS = 30;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { prospectId } = body;

    if (!prospectId) {
      return NextResponse.json(
        { error: "prospectId is required" },
        { status: 400 }
      );
    }

    // 1. Get prospect from DB
    const prospectResult = await query(
      "SELECT * FROM prospects WHERE id = $1",
      [prospectId]
    );
    const prospect = prospectResult.rows[0];

    if (!prospect) {
      return NextResponse.json(
        { error: "Prospect not found" },
        { status: 404 }
      );
    }

    if (!prospect.email) {
      return NextResponse.json(
        { error: "Prospect has no email address" },
        { status: 400 }
      );
    }

    // 2. Get their scan report from DB (if exists)
    let reportData = null;
    if (prospect.scan_report_id) {
      const reportResult = await query(
        "SELECT * FROM scan_reports WHERE id = $1",
        [prospect.scan_report_id]
      );
      reportData = reportResult.rows[0];
    }

    // 3. Get slots left
    const totalUsers = await getTotalUsers();
    const slotsLeft = Math.max(0, FREE_SLOTS - totalUsers);

    // 4. Generate email
    const reportUrl = prospect.scan_report_id
      ? `https://neo-beksprojects.vercel.app/report/${prospect.scan_report_id}`
      : `https://neo-beksprojects.vercel.app`;

    const parsed = reportData?.report_data
      ? typeof reportData.report_data === "string"
        ? JSON.parse(reportData.report_data)
        : reportData.report_data
      : null;

    const emailData = generateOutreachEmail({
      businessName: prospect.business_name,
      city: prospect.city,
      score: parsed?.recommendationScore ?? 0,
      visibleCount: parsed?.strongQueries?.length ?? 0,
      totalQueries:
        (parsed?.strongQueries?.length ?? 0) +
        (parsed?.gapQueries?.length ?? 0) || 25,
      topCompetitor: parsed?.topCompetitor ?? "your top competitor",
      competitorMentions: parsed?.competitorMentions ?? 0,
      reportUrl,
      slotsLeft,
    });

    // 5. Send email via gws CLI
    await execAsync(
      `gws gmail send --to "${prospect.email}" --subject "${emailData.subject.replace(/"/g, '\\"')}" --body "${emailData.body.replace(/"/g, '\\"')}" --from bek@abdik.me`
    );

    // 6. Save to email_sends table
    await saveEmailSend({
      prospectId,
      templateName: "outreach_v1",
      subject: emailData.subject,
      body: emailData.body,
      status: "sent",
    });

    // 7. Update prospect status to 'emailed'
    await updateProspectStatus(prospectId, "emailed");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send email error:", error);
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
