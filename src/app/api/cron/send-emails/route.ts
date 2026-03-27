import { NextResponse } from "next/server";
import { Resend } from "resend";
import {
  getActiveCampaigns,
  getDailySentCount,
  getNextProspectsForCampaign,
  saveEmailSend,
  incrementCampaignSent,
  updateCampaignStatus,
  updateProspectStatus,
} from "@/lib/db";
import {
  interpolateTemplate,
  addUnsubscribeFooter,
} from "@/lib/email-templates";
import {
  APP_URL,
  EMAILS_PER_CRON_RUN,
  WARMUP_SCHEDULE,
  WARMUP_DEFAULT_LIMIT,
} from "@/lib/constants";
import { randomUUID } from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);

export const maxDuration = 60;

/**
 * Cron job: send emails for active campaigns.
 * Runs every 15 minutes via Vercel cron.
 */
export async function GET(request: Request) {
  // Verify cron secret (fail closed — reject if not configured)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const campaigns = await getActiveCampaigns();

    if (campaigns.length === 0) {
      return NextResponse.json({ message: "No active campaigns", sent: 0 });
    }

    // Calculate daily limit based on warm-up schedule
    const campaignAge = (campaign: { created_at: string }) => {
      const days = Math.ceil(
        (Date.now() - new Date(campaign.created_at).getTime()) / 86400000
      );
      return Math.max(1, days);
    };

    let totalSent = 0;
    const fromEmail = process.env.EMAIL_FROM || "bek@abdik.me";

    for (const campaign of campaigns) {
      const age = campaignAge(campaign);
      const dailyLimit = WARMUP_SCHEDULE[age] ?? WARMUP_DEFAULT_LIMIT;
      const dailySent = await getDailySentCount(campaign.id);
      const remainingToday = dailyLimit - dailySent;

      if (remainingToday <= 0) {
        // Daily cap reached for this campaign — skip until tomorrow
        continue;
      }

      const perRunLimit = Math.min(EMAILS_PER_CRON_RUN, remainingToday);

      // Get prospects not yet emailed for this campaign
      const prospects = await getNextProspectsForCampaign(
        campaign.id,
        campaign.vertical,
        campaign.city,
        perRunLimit
      );

      if (prospects.length === 0) {
        // No more prospects — mark campaign completed
        if (campaign.sent_count >= campaign.target_count) {
          await updateCampaignStatus(campaign.id, "completed");
        }
        continue;
      }

      for (const prospect of prospects) {
        // A/B variant selection: alternate based on sent_count
        const useB = campaign.subject_b && campaign.body_b;
        const variant = useB && (campaign.sent_count + totalSent) % 2 === 1 ? "B" : "A";
        const subject = variant === "B" ? campaign.subject_b : campaign.subject_a;
        const body = variant === "B" ? campaign.body_b : campaign.body_a;

        // Interpolate template variables
        const vars: Record<string, string | number> = {
          businessName: prospect.business_name,
          city: prospect.city,
          score: prospect.recommendation_score ?? 0,
          reportUrl: prospect.scan_report_id
            ? `${APP_URL}/report/${prospect.scan_report_id}`
            : APP_URL,
        };

        const finalSubject = interpolateTemplate(subject, vars);
        const unsubToken = randomUUID();
        const finalBody = addUnsubscribeFooter(
          interpolateTemplate(body, vars),
          unsubToken
        );

        // Send via Resend
        const { data, error } = await resend.emails.send({
          from: fromEmail,
          to: prospect.email,
          subject: finalSubject,
          text: finalBody,
        });

        if (error) {
          console.error(`Failed to send to ${prospect.email}:`, error.message);
          continue;
        }

        // Save email send record
        await saveEmailSend({
          prospectId: prospect.id,
          templateName: `campaign_${campaign.id}`,
          subject: finalSubject,
          body: finalBody,
          status: "sent",
          campaignId: campaign.id,
          variant,
          resendId: data?.id || null,
          unsubscribeToken: unsubToken,
        });

        await incrementCampaignSent(campaign.id);
        await updateProspectStatus(prospect.id, "emailed");
        totalSent++;
      }
    }

    return NextResponse.json({
      message: `Sent ${totalSent} emails across ${campaigns.length} campaigns`,
      sent: totalSent,
    });
  } catch (error) {
    console.error("Cron send error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cron failed" },
      { status: 500 }
    );
  }
}
