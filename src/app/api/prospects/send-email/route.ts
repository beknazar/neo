import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  query,
  saveEmailSend,
  updateProspectStatus,
  getTotalUsers,
} from "@/lib/db";
import { generateOutreachEmail } from "@/lib/email-templates";
import { FREE_SLOTS, APP_URL } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { prospectId, subject: customSubject, emailBody: customBody } = body;

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

    // 2. Use custom subject/body if provided, otherwise generate
    let subject = customSubject;
    let emailBody = customBody;

    if (!subject || !emailBody) {
      let reportData = null;
      if (prospect.scan_report_id) {
        const reportResult = await query(
          "SELECT * FROM scan_reports WHERE id = $1",
          [prospect.scan_report_id]
        );
        reportData = reportResult.rows[0];
      }

      const totalUsers = await getTotalUsers();
      const slotsLeft = Math.max(0, FREE_SLOTS - totalUsers);

      const reportUrl = prospect.scan_report_id
        ? `${APP_URL}/report/${prospect.scan_report_id}`
        : APP_URL;

      const parsed = reportData?.report_data
        ? typeof reportData.report_data === "string"
          ? JSON.parse(reportData.report_data)
          : reportData.report_data
        : null;

      const generated = generateOutreachEmail({
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

      subject = subject || generated.subject;
      emailBody = emailBody || generated.body;
    }

    // 3. Send email via Resend
    const fromEmail = process.env.EMAIL_FROM || "bek@abdik.me";
    const { error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: prospect.email,
      subject,
      text: emailBody,
    });

    if (sendError) {
      throw new Error(sendError.message);
    }

    // 4. Save to email_sends table
    await saveEmailSend({
      prospectId,
      templateName: "outreach_v1",
      subject,
      body: emailBody,
      status: "sent",
    });

    // 5. Update prospect status to 'emailed'
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

// Preview endpoint — generates email without sending
export async function PUT(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { prospectId } = body;

    if (!prospectId) {
      return NextResponse.json(
        { error: "prospectId is required" },
        { status: 400 }
      );
    }

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

    let reportData = null;
    if (prospect.scan_report_id) {
      const reportResult = await query(
        "SELECT * FROM scan_reports WHERE id = $1",
        [prospect.scan_report_id]
      );
      reportData = reportResult.rows[0];
    }

    const totalUsers = await getTotalUsers();
    const slotsLeft = Math.max(0, FREE_SLOTS - totalUsers);

    const reportUrl = prospect.scan_report_id
      ? `${APP_URL}/report/${prospect.scan_report_id}`
      : APP_URL;

    const parsed = reportData?.report_data
      ? typeof reportData.report_data === "string"
        ? JSON.parse(reportData.report_data)
        : reportData.report_data
      : null;

    const generated = generateOutreachEmail({
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

    return NextResponse.json({
      to: prospect.email,
      businessName: prospect.business_name,
      subject: generated.subject,
      body: generated.body,
    });
  } catch (error) {
    console.error("Preview email error:", error);
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
