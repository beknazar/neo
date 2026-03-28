/**
 * Tests for email template generation.
 * Regression tests for the competitor mention bug where .count was used
 * instead of .mentionCount, causing competitor mentions to always show 0.
 */

import {
  generateOutreachEmail,
  generateSubjectLine,
  type OutreachEmailData,
} from "@/lib/email-templates";

function makeEmailData(
  overrides: Partial<OutreachEmailData> = {}
): OutreachEmailData {
  return {
    businessName: "Walkup Personal Injury Lawyers",
    city: "New York",
    score: 0,
    visibleCount: 0,
    totalQueries: 10,
    topCompetitor: "Rosenbaum Personal Injury Lawyers",
    competitorMentions: 5,
    reportUrl: "https://neorank.co/report/test-123",
    slotsLeft: 29,
    ...overrides,
  };
}

describe("generateOutreachEmail", () => {
  it("shows competitor mention count when > 0", () => {
    const { body } = generateOutreachEmail(makeEmailData({ competitorMentions: 7 }));
    expect(body).toContain("is getting 7 mentions where you're getting none");
  });

  it("pluralizes 'mention' correctly for 1 mention", () => {
    const { body } = generateOutreachEmail(makeEmailData({ competitorMentions: 1 }));
    expect(body).toContain("is getting 1 mention where you're getting none");
    expect(body).not.toContain("1 mentions");
  });

  it("uses opportunity angle when competitor has 0 mentions", () => {
    const { body } = generateOutreachEmail(makeEmailData({ competitorMentions: 0 }));
    expect(body).not.toContain("is getting 0 mentions");
    expect(body).toContain("there's a real opportunity to be the first one AI recommends");
  });

  it("includes score, report URL, and slots", () => {
    const data = makeEmailData({ score: 15, slotsLeft: 5 });
    const { body } = generateOutreachEmail(data);
    expect(body).toContain("15/100");
    expect(body).toContain(data.reportUrl);
    expect(body).toContain("5 spots remaining");
  });
});

describe("generateSubjectLine", () => {
  it("skips competitor subject when topCompetitor is fallback", () => {
    const data = makeEmailData({ topCompetitor: "your top competitor" });
    const subject = generateSubjectLine(data);
    expect(subject).not.toContain("your top competitor");
  });

  it("can generate competitor subject when real competitor name exists", () => {
    // Hash-based selection means not every call will pick the competitor pattern,
    // but the competitor pattern should be in the pool. Test that it doesn't crash.
    const data = makeEmailData({ topCompetitor: "Smith Law Firm", score: 0 });
    const subject = generateSubjectLine(data);
    expect(subject.length).toBeGreaterThan(0);
    expect(subject.length).toBeLessThanOrEqual(70);
  });
});
