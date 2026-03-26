import {
  scoreGrade,
  gradeClass,
  gradeBorderClass,
  formatDate,
} from "@/lib/scoring";

// ---------------------------------------------------------------------------
// scoreGrade – default thresholds [30, 10]
// ---------------------------------------------------------------------------
describe("scoreGrade (default thresholds [30, 10])", () => {
  it("returns 'good' for scores >= 30", () => {
    expect(scoreGrade(50)).toBe("good");
  });

  it("returns 'warn' for scores >= 10 and < 30", () => {
    expect(scoreGrade(20)).toBe("warn");
  });

  it("returns 'bad' for scores < 10", () => {
    expect(scoreGrade(5)).toBe("bad");
  });

  // Boundary values
  it("returns 'good' when score is exactly at the upper threshold (30)", () => {
    expect(scoreGrade(30)).toBe("good");
  });

  it("returns 'warn' when score is exactly at the lower threshold (10)", () => {
    expect(scoreGrade(10)).toBe("warn");
  });

  it("returns 'bad' when score is just below the lower threshold (9)", () => {
    expect(scoreGrade(9)).toBe("bad");
  });
});

// ---------------------------------------------------------------------------
// scoreGrade – custom thresholds
// ---------------------------------------------------------------------------
describe("scoreGrade (custom thresholds)", () => {
  it("uses custom thresholds correctly: [70, 40] classifies 50 as 'warn'", () => {
    expect(scoreGrade(50, [70, 40])).toBe("warn");
  });

  it("returns 'good' when score meets custom upper threshold", () => {
    expect(scoreGrade(70, [70, 40])).toBe("good");
  });

  it("returns 'bad' when score is below custom lower threshold", () => {
    expect(scoreGrade(39, [70, 40])).toBe("bad");
  });
});

// ---------------------------------------------------------------------------
// gradeClass
// ---------------------------------------------------------------------------
describe("gradeClass", () => {
  it("maps 'good' to 'score-good'", () => {
    expect(gradeClass("good")).toBe("score-good");
  });

  it("maps 'warn' to 'score-warn'", () => {
    expect(gradeClass("warn")).toBe("score-warn");
  });

  it("maps 'bad' to 'score-bad'", () => {
    expect(gradeClass("bad")).toBe("score-bad");
  });
});

// ---------------------------------------------------------------------------
// gradeBorderClass
// ---------------------------------------------------------------------------
describe("gradeBorderClass", () => {
  it("maps 'good' to 'border-t-neo-teal'", () => {
    expect(gradeBorderClass("good")).toBe("border-t-neo-teal");
  });

  it("maps 'warn' to 'border-t-neo-amber'", () => {
    expect(gradeBorderClass("warn")).toBe("border-t-neo-amber");
  });

  it("maps 'bad' to 'border-t-neo-coral'", () => {
    expect(gradeBorderClass("bad")).toBe("border-t-neo-coral");
  });
});

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------
describe("formatDate", () => {
  it("formats an ISO date string into a readable US date", () => {
    const result = formatDate("2024-03-15T12:00:00Z");
    expect(result).toContain("Mar");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("formats a numeric (epoch ms) timestamp", () => {
    // 1710504000000 = 2024-03-15T12:00:00.000Z
    const result = formatDate(1710504000000);
    expect(result).toContain("Mar");
    expect(result).toContain("15");
    expect(result).toContain("2024");
  });

  it("handles a different date correctly", () => {
    // Use midday UTC to avoid timezone-shift issues
    const result = formatDate("2023-12-25T12:00:00Z");
    expect(result).toContain("Dec");
    expect(result).toContain("25");
    expect(result).toContain("2023");
  });
});
