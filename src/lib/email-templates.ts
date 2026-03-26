/**
 * Email template system for prospect outreach.
 * Supports template variables, unsubscribe footer, and A/B variants.
 */

import { APP_URL } from "@/lib/constants";

export interface OutreachEmailData {
  businessName: string;
  city: string;
  score: number;
  visibleCount: number;
  totalQueries: number;
  topCompetitor: string;
  competitorMentions: number;
  reportUrl: string;
  slotsLeft: number;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
}

/**
 * Generate a personalized outreach email for a prospect.
 */
export function generateOutreachEmail(data: OutreachEmailData): GeneratedEmail {
  const subject = `${data.businessName} is invisible to AI search — here's your report`;

  const body = `Hi,

I ran an AI visibility audit on ${data.businessName} and found that you're only appearing in ${data.visibleCount} out of ${data.totalQueries} common searches people make when looking for services in ${data.city}.

Your AI Recommendation Score: ${data.score}/100

Your top competitor (${data.topCompetitor}) is getting ${data.competitorMentions} mentions where you're getting none.

I put together a detailed report with specific fixes:
${data.reportUrl}

We're offering free accounts to the first 30 businesses. ${data.slotsLeft} spots remaining.

Best,
Bek
Neo — AI Search Intelligence`;

  return { subject, body };
}

/**
 * Interpolate {{variables}} in a template string with prospect data.
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val != null ? String(val) : `{{${key}}}`;
  });
}

/**
 * Append CAN-SPAM compliant unsubscribe footer to email body.
 */
export function addUnsubscribeFooter(
  body: string,
  unsubscribeToken: string
): string {
  const unsubUrl = `${APP_URL}/unsubscribe/${unsubscribeToken}`;
  return `${body}

---
To stop receiving emails from us: ${unsubUrl}
Neo | San Francisco, CA`;
}
