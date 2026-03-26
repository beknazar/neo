/**
 * Scoring engine for Neo.
 * Analyzes AI search responses to compute recommendation scores.
 */

import type { QueryResult } from "./perplexity";

export interface MentionDetection {
  query: string;
  runIndex: number;
  mentioned: boolean;
  hasCitation: boolean;
  isTopThree: boolean;
  weight: number;
  matchType: "exact" | "domain" | "fuzzy" | "none";
}

export interface CompetitorMention {
  name: string;
  totalWeight: number;
  mentionCount: number;
}

export interface ScanReport {
  businessName: string;
  businessUrl: string;
  city: string;
  recommendationScore: number;
  shareOfVoice: number;
  totalValidRuns: number;
  totalRuns: number;
  mentions: MentionDetection[];
  competitorMentions: CompetitorMention[];
  gapQueries: string[];
  strongQueries: string[];
  timestamp: number;
}

/**
 * Levenshtein edit distance (absolute).
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Check if a business is mentioned in a response.
 */
function detectMention(
  response: string,
  businessName: string,
  businessDomain: string
): { mentioned: boolean; matchType: MentionDetection["matchType"] } {
  const lower = response.toLowerCase();
  const nameLower = businessName.toLowerCase();

  // Exact name match
  if (lower.includes(nameLower)) {
    return { mentioned: true, matchType: "exact" };
  }

  // Domain match
  if (businessDomain && lower.includes(businessDomain.toLowerCase())) {
    return { mentioned: true, matchType: "domain" };
  }

  // Fuzzy match: check each word sequence of the same length as business name
  const nameWords = nameLower.split(/\s+/);
  const responseWords = lower.split(/\s+/);
  for (let i = 0; i <= responseWords.length - nameWords.length; i++) {
    const candidate = responseWords.slice(i, i + nameWords.length).join(" ");
    if (levenshtein(candidate, nameLower) <= 2) {
      return { mentioned: true, matchType: "fuzzy" };
    }
  }

  return { mentioned: false, matchType: "none" };
}

/**
 * Check if a business appears in the top 3 recommendations.
 * Heuristic: look for numbered lists (1., 2., 3.) or "first", "second", "third".
 */
function isInTopThree(
  response: string,
  businessName: string,
  businessDomain: string
): boolean {
  const lower = response.toLowerCase();
  const nameLower = businessName.toLowerCase();
  const domainLower = businessDomain?.toLowerCase() ?? "";

  // Find numbered list items (1. ... 2. ... 3. ...)
  const numberedPattern = /(?:^|\n)\s*(\d+)[.)]\s*\*{0,2}(.+?)(?:\n|$)/g;
  let match;
  while ((match = numberedPattern.exec(lower)) !== null) {
    const num = parseInt(match[1]);
    const lineContent = match[2];
    if (num <= 3) {
      if (
        lineContent.includes(nameLower) ||
        (domainLower && lineContent.includes(domainLower))
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if the response contains a citation (URL link) to the business.
 */
function hasCitation(response: string, businessDomain: string): boolean {
  if (!businessDomain) return false;
  const domainLower = businessDomain.toLowerCase();
  // Look for URLs containing the domain
  const urlPattern = /https?:\/\/[^\s)>\]]+/g;
  let match;
  while ((match = urlPattern.exec(response)) !== null) {
    if (match[0].toLowerCase().includes(domainLower)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract domain from a URL.
 */
function extractDomain(url: string): string {
  try {
    const parsed = new URL(
      url.startsWith("http") ? url : `https://${url}`
    );
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, "").split("/")[0];
  }
}

/**
 * Extract all business names mentioned in responses (for competitor detection).
 */
function extractBusinessNames(response: string): string[] {
  const names: string[] = [];
  // Look for bold text patterns (**Name**) common in AI responses
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let match;
  while ((match = boldPattern.exec(response)) !== null) {
    const name = match[1].trim();
    // Filter out common non-business patterns
    if (
      name.length > 2 &&
      name.length < 60 &&
      !name.match(
        /^(note|tip|warning|important|best|top|here|why|how|what|the|a |an )/i
      )
    ) {
      names.push(name);
    }
  }
  return names;
}

/**
 * Score all query results for a business.
 */
export function scoreResults(
  results: QueryResult[],
  businessName: string,
  businessUrl: string,
  city: string,
  competitors: string[] = []
): ScanReport {
  const domain = extractDomain(businessUrl);
  const MIN_RESPONSE_LENGTH = 100;

  // Filter valid results
  const validResults = results.filter(
    (r) => r.response.length >= MIN_RESPONSE_LENGTH
  );

  const mentions: MentionDetection[] = validResults.map((result) => {
    const detection = detectMention(result.response, businessName, domain);
    const citation = hasCitation(result.response, domain);
    const topThree = detection.mentioned
      ? isInTopThree(result.response, businessName, domain)
      : false;

    // Weight calculation: additive
    let weight = 0;
    if (detection.mentioned) {
      weight += 1.0; // Name-drop
      if (citation) weight += 1.5; // Citation
      if (topThree) weight += 2.0; // Top-3
    }

    return {
      query: result.query,
      runIndex: result.runIndex,
      mentioned: detection.mentioned,
      hasCitation: citation,
      isTopThree: topThree,
      weight,
      matchType: detection.matchType,
    };
  });

  // Recommendation Score
  const MAX_WEIGHT_PER_RUN = 4.5; // 1.0 + 1.5 + 2.0
  const totalWeight = mentions.reduce((sum, m) => sum + m.weight, 0);
  const maxPossible = validResults.length * MAX_WEIGHT_PER_RUN;
  const recommendationScore =
    maxPossible > 0 ? Math.round((totalWeight / maxPossible) * 100) : 0;

  // Competitor analysis
  const competitorCounts = new Map<string, { weight: number; count: number }>();

  for (const result of validResults) {
    const namesInResponse = extractBusinessNames(result.response);
    for (const name of namesInResponse) {
      const nameLower = name.toLowerCase();
      // Skip if it's the target business
      if (
        nameLower.includes(businessName.toLowerCase()) ||
        businessName.toLowerCase().includes(nameLower)
      ) {
        continue;
      }
      const existing = competitorCounts.get(name) ?? {
        weight: 0,
        count: 0,
      };
      existing.weight += 1.0; // Simple weight for competitors
      existing.count += 1;
      competitorCounts.set(name, existing);
    }
  }

  const competitorMentions: CompetitorMention[] = Array.from(
    competitorCounts.entries()
  )
    .map(([name, data]) => ({
      name,
      totalWeight: data.weight,
      mentionCount: data.count,
    }))
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 10);

  // Share of Voice (reuse totalWeight from recommendation score above)
  const totalCompetitorWeight = competitorMentions.reduce(
    (sum, c) => sum + c.totalWeight,
    0
  );
  const shareOfVoice =
    totalWeight + totalCompetitorWeight > 0
      ? Math.round(
          (totalWeight / (totalWeight + totalCompetitorWeight)) * 100
        )
      : 0;

  // Gap queries (where business was never mentioned across all runs)
  const queryMentionMap = new Map<string, boolean>();
  for (const m of mentions) {
    if (m.mentioned) {
      queryMentionMap.set(m.query, true);
    } else if (!queryMentionMap.has(m.query)) {
      queryMentionMap.set(m.query, false);
    }
  }
  const gapQueries = Array.from(queryMentionMap.entries())
    .filter(([, mentioned]) => !mentioned)
    .map(([query]) => query);

  const strongQueries = Array.from(queryMentionMap.entries())
    .filter(([, mentioned]) => mentioned)
    .map(([query]) => query);

  return {
    businessName,
    businessUrl,
    city,
    recommendationScore,
    shareOfVoice,
    totalValidRuns: validResults.length,
    totalRuns: results.length,
    mentions,
    competitorMentions,
    gapQueries,
    strongQueries,
    timestamp: Date.now(),
  };
}
