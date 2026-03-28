import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  query,
  saveEmailSend,
  updateProspectStatus,
  getTotalUsers,
  linkProspectToReport,
} from "@/lib/db";
import {
  generateOutreachEmail,
  addUnsubscribeFooter,
} from "@/lib/email-templates";
import { FREE_SLOTS, APP_URL, FREE_QUERY_COUNT, FREE_RUNS_PER_QUERY, PROSPECT_STATUS } from "@/lib/constants";
import { requireAdmin } from "@/lib/admin";
import { decodeHtmlEntities } from "@/lib/text";
import { randomUUID } from "crypto";
import { runScanForBusiness } from "@/lib/scanner";
import { inferVerticalFromUrl } from "@/lib/queries";

export const maxDuration = 120;

const resend = new Resend(process.env.RESEND_API_KEY);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildEmailFromReport(reportData: any, prospect: any, reportUrl: string, slotsLeft: number) {
  const parsed = reportData?.report_data
    ? typeof reportData.report_data === "string"
      ? JSON.parse(reportData.report_data)
      : reportData.report_data
    : null;

  const competitors = Array.isArray(parsed?.competitorMentions) ? parsed.competitorMentions : [];

  return generateOutreachEmail({
    businessName: decodeHtmlEntities(prospect.business_name),
    city: prospect.city,
    score: parsed?.recommendationScore ?? 0,
    visibleCount: parsed?.strongQueries?.length ?? 0,
    totalQueries:
      (parsed?.strongQueries?.length ?? 0) +
      (parsed?.gapQueries?.length ?? 0) || 25,
    topCompetitor: competitors[0]?.name ?? "your top competitor",
    competitorMentions: competitors[0]?.mentionCount ?? 0,
    reportUrl,
    slotsLeft,
  });
}

// In-memory lock to prevent concurrent scans for the same prospect
const scanningProspects = new Set<string>();

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

      const generated = buildEmailFromReport(reportData, prospect, reportUrl, slotsLeft);

      subject = subject || generated.subject;
      emailBody = emailBody || generated.body;
    }

    // 3. Append CAN-SPAM unsubscribe footer
    const unsubToken = randomUUID();
    const finalBody = addUnsubscribeFooter(emailBody, unsubToken);

    // 4. Send email via Resend
    const fromEmail = process.env.EMAIL_FROM || "bek@abdik.me";
    const { data, error: sendError } = await resend.emails.send({
      from: fromEmail,
      to: prospect.email,
      subject,
      text: finalBody,
    });

    if (sendError) {
      console.error("Resend API error:", sendError);
      return NextResponse.json(
        { error: `Failed to send email: ${sendError.message}` },
        { status: 500 }
      );
    }

    // 5. Save to email_sends table + update prospect status
    // These are post-send DB operations. If they fail, the email was still
    // sent successfully, so we return success to the user and log the error.
    try {
      await Promise.all([
        saveEmailSend({
          prospectId,
          templateName: "outreach_v1",
          subject,
          body: finalBody,
          status: "sent",
          resendId: data?.id || null,
          unsubscribeToken: unsubToken,
        }),
        updateProspectStatus(prospectId, PROSPECT_STATUS.EMAILED),
      ]);
    } catch (dbError) {
      console.error(
        "Email sent successfully but failed to save to database:",
        dbError
      );
    }

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

    // If no scan report exists, run an on-demand scan
    let reportData = null;
    let scanReportId = prospect.scan_report_id;

    if (!scanReportId) {
      if (scanningProspects.has(prospectId)) {
        return NextResponse.json(
          { error: "A scan is already in progress for this prospect" },
          { status: 409 }
        );
      }

      try {
        scanningProspects.add(prospectId);
        const inferred = inferVerticalFromUrl(
          `${prospect.business_url} ${prospect.business_name}`
        );
        const scanResult = await runScanForBusiness(
          prospect.business_name,
          prospect.business_url,
          prospect.city,
          FREE_QUERY_COUNT,
          FREE_RUNS_PER_QUERY,
          { vertical: inferred ?? undefined }
        );
        scanReportId = scanResult.id;
        await linkProspectToReport(prospectId, scanReportId);
      } finally {
        scanningProspects.delete(prospectId);
      }
    }

    if (scanReportId) {
      const reportResult = await query(
        "SELECT * FROM scan_reports WHERE id = $1",
        [scanReportId]
      );
      reportData = reportResult.rows[0];
    }

    const totalUsers = await getTotalUsers();
    const slotsLeft = Math.max(0, FREE_SLOTS - totalUsers);

    const reportUrl = scanReportId
      ? `${APP_URL}/report/${scanReportId}`
      : APP_URL;

    const generated = buildEmailFromReport(reportData, prospect, reportUrl, slotsLeft);

    return NextResponse.json({
      to: prospect.email,
      businessName: decodeHtmlEntities(prospect.business_name),
      subject: generated.subject,
      body: generated.body,
      scanned: !prospect.scan_report_id,
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
