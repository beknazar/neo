export type Grade = "good" | "warn" | "bad";

export function scoreGrade(
  score: number,
  thresholds: [number, number] = [30, 10]
): Grade {
  if (score >= thresholds[0]) return "good";
  if (score >= thresholds[1]) return "warn";
  return "bad";
}

export function gradeClass(grade: Grade): string {
  const map: Record<Grade, string> = {
    good: "score-good",
    warn: "score-warn",
    bad: "score-bad",
  };
  return map[grade];
}

export function gradeBorderClass(grade: Grade): string {
  const map: Record<Grade, string> = {
    good: "border-t-neo-teal",
    warn: "border-t-neo-amber",
    bad: "border-t-neo-coral",
  };
  return map[grade];
}

export function formatDate(iso: string | number): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
