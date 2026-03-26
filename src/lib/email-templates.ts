/**
 * Email template system for prospect outreach.
 * Generates personalized outreach emails based on scan report data.
 */

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
 * Generate a personalized outreach email for a med spa prospect.
 * Uses scan report data to create urgency and credibility.
 */
export function generateOutreachEmail(data: OutreachEmailData): GeneratedEmail {
  const subject = `${data.businessName} is invisible to AI search — here's your report`;

  const body = `Hi,

I ran an AI visibility audit on ${data.businessName} and found that you're only appearing in ${data.visibleCount} out of ${data.totalQueries} common searches people make when looking for med spas in ${data.city}.

Your AI Recommendation Score: ${data.score}/100

Your top competitor (${data.topCompetitor}) is getting ${data.competitorMentions} mentions where you're getting none.

I put together a detailed report with specific fixes:
→ ${data.reportUrl}

We're offering free accounts to the first 30 med spas. ${data.slotsLeft} spots remaining.

Best,
Bek
Neo — AI Recommendation Capture`;

  return { subject, body };
}
