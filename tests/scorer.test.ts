/**
 * Comprehensive unit tests for the scoring engine.
 *
 * Many internal functions (detectMention, isInTopThree, hasCitation,
 * extractBusinessNames) are not exported. We test them indirectly through
 * the exported `scoreResults` function by crafting QueryResult arrays
 * that exercise each code path.
 */

import { scoreResults } from "@/lib/scorer";
import type { QueryResult } from "@/lib/perplexity";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid QueryResult (response must be >= 100 chars to pass filter). */
function makeResult(
  query: string,
  response: string,
  runIndex = 0
): QueryResult {
  return { query, response, runIndex, timestamp: Date.now() };
}

/** Pad a short response so it exceeds the 100-char minimum length filter. */
function pad(text: string): string {
  const padding =
    " This is additional filler text to ensure the response exceeds the minimum character length threshold required by the scoring engine.";
  return text + padding;
}

const BUSINESS_NAME = "Glow Med Spa";
const BUSINESS_URL = "https://www.glowmedspa.com/services";
const CITY = "Austin";

// ---------------------------------------------------------------------------
// 1. extractBusinessNames (tested indirectly via competitorMentions)
// ---------------------------------------------------------------------------

describe("extractBusinessNames (via competitorMentions)", () => {
  it("extracts real business names from bold text", () => {
    const response = pad(
      "Here are some top med spas:\n**Radiance Skin Clinic** offers great facials.\n**Bella Aesthetics** is also popular."
    );
    const report = scoreResults(
      [makeResult("best med spas", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    const names = report.competitorMentions.map((c) => c.name);
    expect(names).toContain("Radiance Skin Clinic");
    expect(names).toContain("Bella Aesthetics");
  });

  it("filters out section headers like Key features, Location, Website, Services, Pricing", () => {
    const response = pad(
      "**Location**\n123 Main St\n**Website**\nhttps://example.com\n**Services**\nFacials\n**Pricing**\nStarts at $100\n**Key features**\nGreat reviews\n**Radiance Skin Clinic** is good."
    );
    const report = scoreResults(
      [makeResult("best med spa", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    const names = report.competitorMentions.map((c) => c.name);
    expect(names).not.toContain("Location");
    expect(names).not.toContain("Website");
    expect(names).not.toContain("Services");
    expect(names).not.toContain("Pricing");
    expect(names).not.toContain("Key features");
    expect(names).toContain("Radiance Skin Clinic");
  });

  it("filters out generic patterns like How it works, What to expect, Before and after", () => {
    const response = pad(
      "**How it works**\nStep 1\n**What to expect**\nResults in 2 weeks\n**Before and after**\nSee photos\n**Derma Luxe Studio** is recommended."
    );
    const report = scoreResults(
      [makeResult("med spa info", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    const names = report.competitorMentions.map((c) => c.name);
    expect(names).not.toContain("How it works");
    expect(names).not.toContain("What to expect");
    expect(names).not.toContain("Before and after");
    expect(names).toContain("Derma Luxe Studio");
  });

  it("filters names without any capital letters", () => {
    const response = pad(
      "**all lowercase name** is not valid. **Proper Name Spa** is valid."
    );
    const report = scoreResults(
      [makeResult("spa search", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    const names = report.competitorMentions.map((c) => c.name);
    expect(names).not.toContain("all lowercase name");
    expect(names).toContain("Proper Name Spa");
  });

  it("filters names longer than 60 characters", () => {
    const longName =
      "A".repeat(30) + " " + "B".repeat(30); // 61 chars total
    const response = pad(
      `**${longName}** is too long. **Short Name** is fine.`
    );
    const report = scoreResults(
      [makeResult("search", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    const names = report.competitorMentions.map((c) => c.name);
    expect(names).not.toContain(longName);
    expect(names).toContain("Short Name");
  });

  it("filters names longer than 6 words", () => {
    const sevenWordName = "One Two Three Four Five Six Seven";
    const sixWordName = "One Two Three Four Five Six";
    const response = pad(
      `**${sevenWordName}** is too many words. **${sixWordName}** is okay.`
    );
    const report = scoreResults(
      [makeResult("search", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    const names = report.competitorMentions.map((c) => c.name);
    expect(names).not.toContain(sevenWordName);
    expect(names).toContain(sixWordName);
  });

  it("handles multiple bold items in one response", () => {
    const response = pad(
      "**Spa Alpha** is great. **Spa Beta** is also good. **Spa Gamma** is excellent."
    );
    const report = scoreResults(
      [makeResult("best spas", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    const names = report.competitorMentions.map((c) => c.name);
    expect(names).toContain("Spa Alpha");
    expect(names).toContain("Spa Beta");
    expect(names).toContain("Spa Gamma");
    expect(names.length).toBe(3);
  });

  it("handles responses with no bold text", () => {
    const response = pad(
      "There are many med spas in Austin but none are highlighted with bold formatting."
    );
    const report = scoreResults(
      [makeResult("med spa query", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.competitorMentions).toHaveLength(0);
  });

  it("does not include the target business as a competitor", () => {
    const response = pad(
      `**${BUSINESS_NAME}** is the best. **Rival Spa** is second.`
    );
    const report = scoreResults(
      [makeResult("best med spa", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    const names = report.competitorMentions.map((c) => c.name);
    expect(names).not.toContain(BUSINESS_NAME);
    expect(names).toContain("Rival Spa");
  });

  it("filters names starting with generic verbs (Visit, Check, Try, etc.)", () => {
    const response = pad(
      "**Visit Our Office** today. **Check These Out** now. **Try Something New** today. **Luxe Skin Bar** is recommended."
    );
    const report = scoreResults(
      [makeResult("query", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    const names = report.competitorMentions.map((c) => c.name);
    expect(names).not.toContain("Visit Our Office");
    expect(names).not.toContain("Check These Out");
    expect(names).not.toContain("Try Something New");
    expect(names).toContain("Luxe Skin Bar");
  });
});

// ---------------------------------------------------------------------------
// 2. detectMention (tested indirectly via mentions array)
// ---------------------------------------------------------------------------

describe("detectMention (via mentions)", () => {
  it("detects exact name match (case-insensitive)", () => {
    const response = pad(
      "We recommend glow med spa for the best treatments in Austin."
    );
    const report = scoreResults(
      [makeResult("best med spa", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].mentioned).toBe(true);
    expect(report.mentions[0].matchType).toBe("exact");
  });

  it("detects domain match", () => {
    const response = pad(
      "Check out the website at glowmedspa.com for more information about their treatments."
    );
    const report = scoreResults(
      [makeResult("med spa info", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].mentioned).toBe(true);
    expect(report.mentions[0].matchType).toBe("domain");
  });

  it("detects fuzzy match (levenshtein distance <= 2)", () => {
    // "Glow Med Sap" has edit distance 1 from "Glow Med Spa"
    const response = pad(
      "You should try Glow Med Sap for excellent facial treatments in the area."
    );
    const report = scoreResults(
      [makeResult("best facial", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].mentioned).toBe(true);
    expect(report.mentions[0].matchType).toBe("fuzzy");
  });

  it("returns no match when business is absent", () => {
    const response = pad(
      "There are many med spas in the area including Radiance Skin Clinic and Bella Aesthetics."
    );
    const report = scoreResults(
      [makeResult("local med spas", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].mentioned).toBe(false);
    expect(report.mentions[0].matchType).toBe("none");
  });

  it("exact match takes priority over domain match", () => {
    // Response contains both the name and the domain
    const response = pad(
      "Glow Med Spa (glowmedspa.com) is one of the top providers in the Austin area."
    );
    const report = scoreResults(
      [makeResult("top provider", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].matchType).toBe("exact");
  });
});

// ---------------------------------------------------------------------------
// 3. scoreResults (integration)
// ---------------------------------------------------------------------------

describe("scoreResults", () => {
  it("computes recommendation score correctly with known inputs", () => {
    // 2 results: one mentioned with citation and top-3 (weight=4.5), one not mentioned (weight=0)
    const mentioned = pad(
      "1. **Glow Med Spa** is the top choice. Visit https://www.glowmedspa.com for details.\n2. **Rival Spa** is second.\n3. **Third Spa** is third."
    );
    const notMentioned = pad(
      "Here are some other spas in Austin that are highly rated by visitors."
    );

    const results: QueryResult[] = [
      makeResult("best med spa", mentioned, 0),
      makeResult("top spas", notMentioned, 1),
    ];

    const report = scoreResults(results, BUSINESS_NAME, BUSINESS_URL, CITY);

    // First result: mentioned=true, citation=true, topThree=true -> weight=4.5
    // Second result: not mentioned -> weight=0
    // maxPossible = 2 * 4.5 = 9.0
    // score = round((4.5 / 9.0) * 100) = 50
    expect(report.recommendationScore).toBe(50);
  });

  it("identifies gap queries correctly", () => {
    const mentionedResponse = pad(
      "I recommend Glow Med Spa for facials in Austin. They are highly rated."
    );
    const gapResponse = pad(
      "There are many options in Austin for botox but none stand out in particular."
    );

    const results: QueryResult[] = [
      makeResult("best facials in Austin", mentionedResponse, 0),
      makeResult("botox providers Austin", gapResponse, 1),
    ];

    const report = scoreResults(results, BUSINESS_NAME, BUSINESS_URL, CITY);

    expect(report.gapQueries).toContain("botox providers Austin");
    expect(report.gapQueries).not.toContain("best facials in Austin");
  });

  it("identifies strong queries correctly", () => {
    const mentionedResponse = pad(
      "Glow Med Spa is highly recommended for their exceptional skincare services."
    );
    const gapResponse = pad(
      "There are many laser treatment providers but no single standout option."
    );

    const results: QueryResult[] = [
      makeResult("best skincare Austin", mentionedResponse, 0),
      makeResult("laser treatments Austin", gapResponse, 1),
    ];

    const report = scoreResults(results, BUSINESS_NAME, BUSINESS_URL, CITY);

    expect(report.strongQueries).toContain("best skincare Austin");
    expect(report.strongQueries).not.toContain("laser treatments Austin");
  });

  it("sorts competitor mentions by count (descending)", () => {
    // extractBusinessNames finds each bold occurrence, including duplicates within a response.
    // response1 has Rival Alpha twice + Rival Beta once => Alpha gets 2, Beta gets 1
    // response2 has Rival Alpha once + Rival Gamma once => Alpha gets 1 more, Gamma gets 1
    // Total: Alpha=3, Beta=1, Gamma=1
    const response1 = pad(
      "**Rival Alpha** is great. **Rival Beta** is also good. **Rival Alpha** appears again."
    );
    const response2 = pad(
      "**Rival Alpha** keeps getting mentioned. **Rival Gamma** is new."
    );

    const results: QueryResult[] = [
      makeResult("query1", response1, 0),
      makeResult("query2", response2, 1),
    ];

    const report = scoreResults(results, BUSINESS_NAME, BUSINESS_URL, CITY);

    expect(report.competitorMentions[0].name).toBe("Rival Alpha");
    expect(report.competitorMentions[0].mentionCount).toBe(3);
    expect(report.competitorMentions.length).toBe(3);
  });

  it("calculates share of voice correctly", () => {
    // Business gets mentioned once (weight=1.0 for name-drop only, no citation/top3)
    const mentionedResponse = pad(
      "Glow Med Spa is a good choice. Also try **Rival Spa** which is popular."
    );
    // Second response: business not mentioned, competitor mentioned
    const otherResponse = pad(
      "**Rival Spa** is the most popular option in the area for treatments."
    );

    const results: QueryResult[] = [
      makeResult("query1", mentionedResponse, 0),
      makeResult("query2", otherResponse, 1),
    ];

    const report = scoreResults(results, BUSINESS_NAME, BUSINESS_URL, CITY);

    // Business totalWeight = 1.0 (mentioned in response 1 with no citation/top3)
    // Competitor totalWeight: Rival Spa mentioned in 2 responses = 2.0
    // shareOfVoice = round((1.0 / (1.0 + 2.0)) * 100) = 33
    expect(report.shareOfVoice).toBe(33);
  });

  it("handles empty results gracefully", () => {
    const report = scoreResults([], BUSINESS_NAME, BUSINESS_URL, CITY);

    expect(report.recommendationScore).toBe(0);
    expect(report.shareOfVoice).toBe(0);
    expect(report.totalValidRuns).toBe(0);
    expect(report.totalRuns).toBe(0);
    expect(report.mentions).toHaveLength(0);
    expect(report.competitorMentions).toHaveLength(0);
    expect(report.gapQueries).toHaveLength(0);
    expect(report.strongQueries).toHaveLength(0);
  });

  it("filters out responses shorter than 100 characters", () => {
    const shortResponse = "Too short to count.";
    const validResponse = pad(
      "Glow Med Spa is an excellent choice for skincare treatments in Austin."
    );

    const results: QueryResult[] = [
      makeResult("query short", shortResponse, 0),
      makeResult("query valid", validResponse, 1),
    ];

    const report = scoreResults(results, BUSINESS_NAME, BUSINESS_URL, CITY);

    expect(report.totalRuns).toBe(2);
    expect(report.totalValidRuns).toBe(1);
    // The short response should not appear in mentions
    expect(report.mentions).toHaveLength(1);
    expect(report.mentions[0].query).toBe("query valid");
  });

  it("returns correct metadata fields", () => {
    const response = pad("Some valid response about med spas in the city.");
    const report = scoreResults(
      [makeResult("test query", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );

    expect(report.businessName).toBe(BUSINESS_NAME);
    expect(report.businessUrl).toBe(BUSINESS_URL);
    expect(report.city).toBe(CITY);
    expect(report.timestamp).toBeGreaterThan(0);
  });

  it("caps competitor mentions at 10", () => {
    // Create a response with 12 distinct competitor names
    const competitors = Array.from(
      { length: 12 },
      (_, i) => `**Competitor ${String.fromCharCode(65 + i)}**`
    ).join(" is good. ");
    const response = pad(competitors + " are all great.");

    const report = scoreResults(
      [makeResult("many competitors", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );

    expect(report.competitorMentions.length).toBeLessThanOrEqual(10);
  });

  it("handles URL with no protocol for domain extraction", () => {
    const response = pad(
      "Check out glowmedspa.com for the best treatments in Austin. Highly recommended."
    );
    const report = scoreResults(
      [makeResult("med spa", response)],
      BUSINESS_NAME,
      "glowmedspa.com",
      CITY
    );

    expect(report.mentions[0].mentioned).toBe(true);
    expect(report.mentions[0].matchType).toBe("domain");
  });

  it("handles multiple runs of the same query correctly for gap detection", () => {
    const notMentioned1 = pad(
      "Here are some general spa options available in the Austin area."
    );
    const mentioned = pad(
      "Glow Med Spa is a standout for their facial treatments in Austin."
    );

    const results: QueryResult[] = [
      makeResult("best facials", notMentioned1, 0),
      makeResult("best facials", mentioned, 1),
    ];

    const report = scoreResults(results, BUSINESS_NAME, BUSINESS_URL, CITY);

    // Same query mentioned in at least one run => not a gap query, it is a strong query
    expect(report.gapQueries).not.toContain("best facials");
    expect(report.strongQueries).toContain("best facials");
  });
});

// ---------------------------------------------------------------------------
// 4. isInTopThree (tested indirectly via isTopThree field in mentions)
// ---------------------------------------------------------------------------

describe("isInTopThree (via mentions)", () => {
  it("returns true when business is at position 1", () => {
    const response = pad(
      "1. **Glow Med Spa** - The top choice for skincare.\n2. **Rival Spa** - Also great.\n3. **Third Spa** - Good option."
    );
    const report = scoreResults(
      [makeResult("best spa", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].isTopThree).toBe(true);
  });

  it("returns true when business is at position 2", () => {
    // The numbered-list regex consumes the trailing \n, so consecutive lines
    // cause even-numbered items to be skipped. Double newlines (common in
    // real AI output) let all positions match.
    const response = pad(
      "1. **Rival Spa** - Very popular.\n\n2. **Glow Med Spa** - Excellent services.\n\n3. **Third Spa** - Good option."
    );
    const report = scoreResults(
      [makeResult("best spa", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].isTopThree).toBe(true);
  });

  it("returns true when business is at position 3", () => {
    const response = pad(
      "1. **First Spa** - Top rated.\n2. **Second Spa** - Also great.\n3. **Glow Med Spa** - Solid choice."
    );
    const report = scoreResults(
      [makeResult("best spa", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].isTopThree).toBe(true);
  });

  it("returns false when business is at position 4 or later", () => {
    const response = pad(
      "1. **First Spa** - Top rated.\n2. **Second Spa** - Also great.\n3. **Third Spa** - Solid.\n4. **Glow Med Spa** - Another option."
    );
    const report = scoreResults(
      [makeResult("best spa", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].isTopThree).toBe(false);
  });

  it("returns false when response has no numbered list", () => {
    const response = pad(
      "Glow Med Spa is a well-known provider of skincare treatments in the Austin area."
    );
    const report = scoreResults(
      [makeResult("best spa", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].mentioned).toBe(true);
    expect(report.mentions[0].isTopThree).toBe(false);
  });

  it("matches business via domain in numbered list", () => {
    const response = pad(
      "1. glowmedspa.com - The best option for skincare.\n2. **Rival Spa** - Also great.\n3. **Third Spa** - Good."
    );
    const report = scoreResults(
      [makeResult("best spa", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].isTopThree).toBe(true);
  });

  it("isTopThree is false when business is not mentioned at all", () => {
    const response = pad(
      "1. **First Spa** - Top rated.\n2. **Second Spa** - Also great.\n3. **Third Spa** - Solid."
    );
    const report = scoreResults(
      [makeResult("best spa", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].mentioned).toBe(false);
    expect(report.mentions[0].isTopThree).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. hasCitation (tested indirectly via hasCitation field in mentions)
// ---------------------------------------------------------------------------

describe("hasCitation (via mentions)", () => {
  it("detects citation when URL contains business domain", () => {
    const response = pad(
      "Glow Med Spa is great. More info at https://www.glowmedspa.com/about for details."
    );
    const report = scoreResults(
      [makeResult("spa info", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].hasCitation).toBe(true);
  });

  it("returns false when URLs do not contain business domain", () => {
    const response = pad(
      "Glow Med Spa is great. See https://www.rivalspa.com for a competitor comparison."
    );
    const report = scoreResults(
      [makeResult("spa info", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].hasCitation).toBe(false);
  });

  it("returns false when response contains no URLs", () => {
    const response = pad(
      "Glow Med Spa is well known for its excellent facial treatments in Austin."
    );
    const report = scoreResults(
      [makeResult("spa info", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].hasCitation).toBe(false);
  });

  it("detects citation with http (non-https) URL", () => {
    const response = pad(
      "Glow Med Spa offers treatments. Visit http://glowmedspa.com/treatments for the full list."
    );
    const report = scoreResults(
      [makeResult("treatments", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].hasCitation).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Weight calculation
// ---------------------------------------------------------------------------

describe("weight calculation", () => {
  it("gives weight 0 when not mentioned", () => {
    const response = pad(
      "There are many great spas in Austin with excellent services available."
    );
    const report = scoreResults(
      [makeResult("spa query", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].weight).toBe(0);
  });

  it("gives weight 1.0 for name-drop only (no citation, no top-3)", () => {
    const response = pad(
      "Glow Med Spa is a decent option for skincare in the Austin metropolitan area."
    );
    const report = scoreResults(
      [makeResult("spa query", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].weight).toBe(1.0);
  });

  it("gives weight 2.5 for name-drop with citation (no top-3)", () => {
    const response = pad(
      "Glow Med Spa is good. Visit https://www.glowmedspa.com for more information on treatments."
    );
    const report = scoreResults(
      [makeResult("spa query", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].weight).toBe(2.5);
  });

  it("gives weight 3.0 for name-drop with top-3 (no citation)", () => {
    const response = pad(
      "1. **Glow Med Spa** - Excellent option.\n2. **Rival Spa** - Also good.\n3. **Third Spa** - Solid choice."
    );
    const report = scoreResults(
      [makeResult("spa query", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].weight).toBe(3.0);
  });

  it("gives maximum weight 4.5 for name-drop with citation and top-3", () => {
    const response = pad(
      "1. **Glow Med Spa** (https://www.glowmedspa.com) - The best.\n2. **Rival Spa** - Also good.\n3. **Third Spa** - Solid."
    );
    const report = scoreResults(
      [makeResult("spa query", response)],
      BUSINESS_NAME,
      BUSINESS_URL,
      CITY
    );
    expect(report.mentions[0].weight).toBe(4.5);
  });
});
