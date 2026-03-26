/**
 * Generate fix recommendations using AI based on scan results.
 */

import type { ScanReport } from "./scorer";

export interface FixRecommendation {
  category: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

export interface NeoReport extends ScanReport {
  fixes: FixRecommendation[];
  summary: string;
}

/**
 * Generate the AI-powered fix recommendations.
 * Uses the scan report data to create actionable recommendations.
 */
export async function generateFixes(
  report: ScanReport
): Promise<NeoReport> {
  const fixes: FixRecommendation[] = [];

  // Content gap fixes — pages to create
  if (report.gapQueries.length > 0) {
    const topGaps = report.gapQueries.slice(0, 5);
    for (const query of topGaps) {
      fixes.push({
        category: "Content",
        title: `Create a page targeting: "${query}"`,
        description: `AI engines don't mention you for "${query}". Create a dedicated page with this topic as the H1, include FAQ sections, and ensure your business name appears naturally.`,
        priority: "high",
      });
    }
  }

  // Schema markup fixes
  fixes.push({
    category: "Schema",
    title: "Add MedicalBusiness structured data",
    description: `Add JSON-LD MedicalBusiness schema to your homepage and service pages. Include: name, address, phone, opening hours, medical specialties, and accepted insurance. This helps AI engines understand your business.`,
    priority: "high",
  });

  fixes.push({
    category: "Schema",
    title: "Add FAQPage schema to service pages",
    description: `Add FAQPage structured data to each service page. AI engines heavily favor content that's structured as Q&A — it maps directly to how users ask questions.`,
    priority: "medium",
  });

  // Review strategy
  fixes.push({
    category: "Reviews",
    title: "Build review presence on key platforms",
    description: `AI engines use reviews as a pass/fail gate. Businesses below 4.0 stars are excluded from ChatGPT recommendations. Focus on Google Business Profile, Yelp, and RealSelf (med spa specific). Aim for 50+ reviews with 4.5+ average.`,
    priority: "high",
  });

  // Content structure
  if (report.recommendationScore < 30) {
    fixes.push({
      category: "Content Structure",
      title: "Rewrite service pages in answer-first format",
      description: `AI engines cite content that leads with the answer. Each service page should start with a 120-180 word summary that directly answers "What is [service] and who is it for?" before going into details.`,
      priority: "high",
    });
  }

  // Competitor analysis fix
  if (report.competitorMentions.length > 0) {
    const topCompetitor = report.competitorMentions[0];
    fixes.push({
      category: "Competitive",
      title: `Analyze why ${topCompetitor.name} outranks you`,
      description: `${topCompetitor.name} was mentioned ${topCompetitor.mentionCount} times across queries where you weren't. Review their content structure, schema markup, and review presence to understand what AI engines prefer about them.`,
      priority: "medium",
    });
  }

  // FAQ recommendations
  fixes.push({
    category: "FAQ",
    title: "Add 10 high-intent FAQ questions",
    description: generateFAQSuggestions(report.city),
    priority: "medium",
  });

  // Local authority signals
  fixes.push({
    category: "Authority",
    title: "Build local citation consistency",
    description: `Ensure your business name, address, and phone (NAP) are identical across Google Business Profile, Yelp, Healthgrades, RealSelf, and your website. Inconsistencies confuse AI engines.`,
    priority: "medium",
  });

  // Generate summary
  const summary = generateSummary(report, fixes);

  return {
    ...report,
    fixes,
    summary,
  };
}

function generateFAQSuggestions(city: string): string {
  const faqs = [
    `How much does Botox cost in ${city}?`,
    `What is the best med spa in ${city}?`,
    `How long does lip filler last?`,
    `Is CoolSculpting worth it?`,
    `What's the difference between Botox and Dysport?`,
    `How to choose a med spa?`,
    `What is a HydraFacial and how does it work?`,
    `How often should I get microneedling?`,
    `What are the best anti-aging treatments?`,
    `Are med spa treatments safe?`,
  ];
  return `Add these FAQ questions (with detailed answers) to your site:\n${faqs.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
}

function generateSummary(
  report: ScanReport,
  fixes: FixRecommendation[]
): string {
  const score = report.recommendationScore;
  const gaps = report.gapQueries.length;
  const strengths = report.strongQueries.length;
  const highPriorityFixes = fixes.filter((f) => f.priority === "high").length;

  let grade: string;
  if (score >= 60) grade = "Strong";
  else if (score >= 30) grade = "Moderate";
  else if (score >= 10) grade = "Weak";
  else grade = "Invisible";

  return `${report.businessName} has a ${grade.toLowerCase()} AI visibility score of ${score}/100 in ${report.city}. You appear in ${strengths} out of 25 query categories and are invisible in ${gaps}. Your share of voice is ${report.shareOfVoice}% compared to competitors. There are ${highPriorityFixes} high-priority fixes that could significantly improve your AI search presence.`;
}
