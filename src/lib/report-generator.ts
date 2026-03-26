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
        title: `Create a dedicated page: "${query}"`,
        description: `${report.businessName} is invisible for "${query}" — AI engines never mention you for this topic. Create a page with "${query}" as the H1 and a 150-word opening paragraph that directly answers the searcher's intent (e.g., "Looking for ${query.toLowerCase()} in ${report.city}? ${report.businessName} offers..."). Follow with 3-5 subheadings covering pricing, what to expect, recovery time, and results. Add a FAQ section with 4-6 questions real patients ask about this topic. Include before/after details and link to your booking page. Pages structured this way match how AI engines extract and cite answers.`,
        priority: "high",
      });
    }
  }

  // Schema markup fixes
  fixes.push({
    category: "Schema",
    title: "Add MedicalBusiness structured data",
    description: `${report.businessName} needs JSON-LD MedicalBusiness schema on the homepage and every service page. Include: "${report.businessName}" as the name, your ${report.city} address, phone, opening hours, medical specialties, and accepted insurance. AI engines parse structured data first when deciding which businesses to recommend — without it, you're relying entirely on unstructured text.`,
    priority: "high",
  });

  fixes.push({
    category: "Schema",
    title: "Add FAQPage schema to service pages",
    description: `Add FAQPage structured data to each of ${report.businessName}'s service pages. AI engines heavily favor content structured as Q&A because it maps directly to how users phrase questions (e.g., "best Botox in ${report.city}"). Each FAQ item needs a clear question and a 2-3 sentence answer. This is one of the fastest ways to get cited.`,
    priority: "medium",
  });

  // Review strategy
  fixes.push({
    category: "Reviews",
    title: "Build review presence on key platforms",
    description: `AI engines treat reviews as a pass/fail gate — med spas below 4.0 stars in ${report.city} are excluded from AI recommendations entirely. ${report.businessName} should aim for 50+ reviews with a 4.5+ average on Google Business Profile, Yelp, and RealSelf. Send a review request to every client within 24 hours of their appointment. Include a direct link to your Google review page — reducing friction increases completion rates by 3-5x.`,
    priority: "high",
  });

  // Content structure
  if (report.recommendationScore < 30) {
    fixes.push({
      category: "Content Structure",
      title: "Rewrite service pages in answer-first format",
      description: `AI engines cite content that leads with a direct answer, not marketing copy. Each of ${report.businessName}'s service pages should open with a 120-180 word summary that answers "What is [service] at ${report.businessName} in ${report.city}, and who is it for?" Put the answer in the first paragraph — before any hero images, sliders, or promotional content. Follow with sections on: procedure details, expected results, pricing transparency, and a clear CTA. Pages that bury the answer below the fold are almost never cited by AI engines.`,
      priority: "high",
    });
  }

  // Competitor analysis fix
  if (report.competitorMentions.length > 0) {
    const topCompetitor = report.competitorMentions[0];
    fixes.push({
      category: "Competitive",
      title: `Reverse-engineer why ${topCompetitor.name} outranks ${report.businessName}`,
      description: `${topCompetitor.name} was mentioned ${topCompetitor.mentionCount} times in queries where ${report.businessName} was invisible. Here's how to close the gap: (1) Visit their website and note how many dedicated service pages they have vs. yours — more pages means more chances to be cited. (2) Check their Google Business Profile for review count and average rating. (3) Run their URL through Google's Rich Results Test to see if they have structured data you're missing. (4) Look at their page structure — do they lead with direct answers or marketing fluff? (5) Compare their blog/content output over the past 6 months. Match or exceed their content volume and quality on the topics where ${report.businessName} is currently invisible.`,
      priority: "medium",
    });
  }

  // FAQ recommendations
  fixes.push({
    category: "FAQ",
    title: "Add high-intent FAQ questions to every service page",
    description: generateFAQSuggestions(report.businessName, report.city, report.gapQueries),
    priority: "medium",
  });

  // Local authority signals
  fixes.push({
    category: "Authority",
    title: "Audit and fix local citation consistency",
    description: `Search Google for "${report.businessName} ${report.city}" and check that the business name, address, and phone number (NAP) are identical on every listing — Google Business Profile, Yelp, Healthgrades, RealSelf, and ${report.businessUrl}. Even small differences (e.g., "St." vs "Street", missing suite numbers) cause AI engines to treat listings as separate businesses, diluting ${report.businessName}'s authority. Fix inconsistencies within a single sitting — this is a one-time task that compounds over time.`,
    priority: "medium",
  });

  // Quick win for very low scores
  if (report.recommendationScore < 20) {
    fixes.push({
      category: "Quick Win",
      title: "Update your Google Business Profile today",
      description: `${report.businessName}'s AI visibility starts with Google Business Profile. Log in today and update the business description to include "${report.city} med spa" and your top 3 services by name. Add at least 10 recent, high-quality photos (treatment rooms, before/afters, team). Respond to every existing review — even a short "Thank you" shows AI engines the business is active. Complete every optional field (services, attributes, Q&A). This alone can improve AI search mentions within 2-4 weeks and takes under an hour.`,
      priority: "high",
    });
  }

  // Technical SEO for sites that aren't being cited
  if (report.strongQueries.length < report.gapQueries.length) {
    fixes.push({
      category: "Technical",
      title: "Add structured data to every service page",
      description: `${report.businessName} is mentioned in fewer queries than it's missing from, which signals a technical gap. Add MedicalBusiness and Service schema (JSON-LD format) to every service page. Each schema block should include: business name ("${report.businessName}"), ${report.city} address, phone, hours, price ranges, and a 2-3 sentence description of the service. Place the JSON-LD in the <head> of each page. AI engines weight structured data heavily for local med spa recommendations — this is often the difference between being cited and being ignored.`,
      priority: "high",
    });
  }

  // Generate summary
  const summary = generateSummary(report, fixes);

  return {
    ...report,
    fixes,
    summary,
  };
}

function generateFAQSuggestions(
  businessName: string,
  city: string,
  gapQueries: string[]
): string {
  // Build FAQ suggestions from actual gap queries first, then fill with high-value defaults
  const gapFAQs = gapQueries.slice(0, 4).map((q) => {
    // Transform gap queries into natural FAQ format
    const lower = q.toLowerCase();
    if (lower.startsWith("best ") || lower.startsWith("top ")) {
      return `What makes ${businessName} one of the ${lower} in ${city}?`;
    }
    if (lower.includes("cost") || lower.includes("price")) {
      return `How much does ${lower.replace(city.toLowerCase(), "").trim()} cost at ${businessName}?`;
    }
    return `What should I know about ${lower} at ${businessName} in ${city}?`;
  });

  const defaultFAQs = [
    `How much does Botox cost at ${businessName} in ${city}?`,
    `What makes ${businessName} different from other med spas in ${city}?`,
    `Is ${businessName} a good choice for first-time med spa patients?`,
    `What are the most popular treatments at ${businessName}?`,
    `How do I prepare for my first appointment at ${businessName}?`,
    `Does ${businessName} offer financing or payment plans?`,
  ];

  // Combine gap-derived FAQs with defaults, avoiding duplicates, cap at 10
  const seen = new Set<string>();
  const combined: string[] = [];
  for (const faq of [...gapFAQs, ...defaultFAQs]) {
    const key = faq.toLowerCase();
    if (!seen.has(key) && combined.length < 10) {
      seen.add(key);
      combined.push(faq);
    }
  }

  return `Add these FAQ questions to ${businessName}'s service pages with detailed, honest 2-4 sentence answers. Each answer should name ${businessName} and ${city} naturally — AI engines extract Q&A pairs verbatim:\n${combined.map((q, i) => `${i + 1}. ${q}`).join("\n")}`;
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

  const totalQueries = strengths + gaps;

  let benchmark: string;
  if (score >= 60) {
    benchmark = `That puts ${report.businessName} ahead of most competitors — but there's still room to dominate.`;
  } else if (score >= 30) {
    benchmark = `Most med spas in ${report.city} score between 15-35. ${report.businessName} is in that range — meaning you're visible but not standing out.`;
  } else {
    benchmark = `Most med spas in ${report.city} score between 15-35. At ${score}, ${report.businessName} is below average — AI engines are recommending your competitors instead.`;
  }

  return `${report.businessName} has a ${grade.toLowerCase()} AI visibility score of ${score}/100 in ${report.city}. ${benchmark} You appear in ${strengths} out of ${totalQueries} query categories and are invisible in ${gaps}. Your share of voice is ${report.shareOfVoice}% compared to competitors. There are ${highPriorityFixes} high-priority fixes below — start with the ones marked "high priority" to see the fastest improvement.`;
}
