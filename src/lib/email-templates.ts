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
 * Simple string hash that returns a consistent positive integer for a given input.
 * Used to deterministically select a subject line variant per business.
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Subject line patterns for cold outreach.
 * Each returns a subject string given prospect data.
 * Patterns are ordered by index for consistent selection.
 */
const SUBJECT_PATTERNS: Array<{
  id: string;
  generate: (data: OutreachEmailData) => string;
  /** If true, this pattern requires a real competitor name (not the fallback). */
  requiresCompetitor?: boolean;
  /** If true, this pattern is best suited for prospects with a score of 0. */
  zeroScorePreferred?: boolean;
}> = [
  {
    id: "curiosity",
    generate: (d) => `I found something about ${d.businessName}`,
  },
  {
    id: "stat",
    zeroScorePreferred: true,
    generate: (d) =>
      `${d.businessName}: ${d.visibleCount}/${d.totalQueries} AI searches mention you`,
  },
  {
    id: "competitor",
    requiresCompetitor: true,
    zeroScorePreferred: true,
    generate: (d) => {
      const subject = `${d.topCompetitor} shows up in AI search. ${d.businessName} doesn't`;
      // Trim if over 50 chars — use shorter form
      if (subject.length > 70) {
        return `${d.topCompetitor} is in AI search. You're not`;
      }
      return subject;
    },
  },
  {
    id: "question",
    generate: (d) => `Is ${d.businessName} invisible to ChatGPT?`,
  },
  {
    id: "value",
    generate: (d) => `Free AI visibility report for ${d.businessName}`,
  },
  {
    id: "urgency",
    generate: (d) =>
      `${d.slotsLeft} free spots left — ${d.businessName}'s AI audit inside`,
  },
];

/**
 * Pick a dynamic subject line for outreach based on the prospect's data.
 *
 * Selection logic:
 * - Uses a hash of the business name so the same prospect always gets the same variant.
 * - When the score is 0, prefers patterns marked as zeroScorePreferred.
 * - Skips the competitor pattern when topCompetitor is the generic fallback.
 * - Keeps subjects under 50 chars when possible (never over 70).
 */
export function generateSubjectLine(data: OutreachEmailData): string {
  const hasRealCompetitor =
    data.topCompetitor !== "your top competitor" &&
    data.topCompetitor.length > 0;

  // Build the eligible pattern pool
  let pool = SUBJECT_PATTERNS.filter((p) => {
    if (p.requiresCompetitor && !hasRealCompetitor) return false;
    return true;
  });

  // For zero-score prospects, prefer the more impactful patterns
  if (data.score === 0) {
    const zeroPool = pool.filter((p) => p.zeroScorePreferred);
    if (zeroPool.length > 0) {
      pool = zeroPool;
    }
  }

  const hash = hashString(data.businessName);
  const index = hash % pool.length;
  return pool[index].generate(data);
}

/**
 * Generate a personalized outreach email for a prospect.
 */
export function generateOutreachEmail(data: OutreachEmailData): GeneratedEmail {
  const subject = generateSubjectLine(data);

  const body = `Hi,

I ran an AI visibility audit on ${data.businessName} and found that you're only appearing in ${data.visibleCount} out of ${data.totalQueries} common searches people make when looking for services in ${data.city}.

Your AI Recommendation Score: ${data.score}/100

Your top competitor (${data.topCompetitor}) is getting ${data.competitorMentions} mentions where you're getting none.

I put together a detailed report with specific fixes:
${data.reportUrl}

We're offering free accounts to the first 30 businesses. ${data.slotsLeft} spots remaining.

Best,
Bek`;

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
Bek Abdik | San Francisco, CA`;
}
