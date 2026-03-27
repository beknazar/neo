import { getReport, getReportBySlug } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NeoLogo } from "@/components/neo-logo";
import { SCARCITY_MIN } from "@/lib/constants";
import { type Grade, scoreGrade, gradeClass, gradeBorderClass, formatDate } from "@/lib/scoring";
import type { Metadata } from "next";
import {
  Trophy,
  TrendingUp,
  Eye,
  EyeOff,
  Lock,
  ArrowRight,
  X,
  Users,
  Clock,
} from "lucide-react";

type PageProps = {
  params: Promise<{ slug: string }>;
};

import { decodeHtmlEntities } from "@/lib/text";

/* -------------------------------------------------------------------------- */
/*  SEO Metadata                                                              */
/* -------------------------------------------------------------------------- */

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;

  // Try slug first, fall back to UUID for old links
  let row = await getReportBySlug(slug);
  if (!row) row = await getReport(slug);
  if (!row) return { title: "Report Not Found" };

  const report = row.report_data;
  const name = decodeHtmlEntities(report.businessName);
  return {
    title: `${name} AI Visibility Report — Neo`,
    description: `${name} scored ${report.recommendationScore}/100 for AI search visibility in ${report.city}. ${report.strongQueries.length} visible queries, ${report.gapQueries.length} gaps found.`,
    openGraph: {
      title: `${name} AI Visibility Report`,
      description: `AI search visibility score: ${report.recommendationScore}/100 in ${report.city}`,
    },
  };
}

/* -------------------------------------------------------------------------- */
/*  Page Component                                                            */
/* -------------------------------------------------------------------------- */

export default async function ReportPage({ params }: PageProps) {
  const { slug } = await params;

  // Try slug first, fall back to UUID for old links
  const slugRow = await getReportBySlug(slug);
  const row = slugRow ?? (await getReport(slug));
  if (!row) notFound();

  const report = row.report_data;
  const day = Math.floor(Date.now() / 86400000);
  const slotsLeft = (day % 7) + SCARCITY_MIN;
  const fixCount = report.fixes?.length || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <NeoLogo />
          <div className="flex items-center gap-3">
            {slotsLeft > 0 && (
              <Badge variant="secondary" className="font-mono text-xs">
                {slotsLeft} free slots left
              </Badge>
            )}
            <Link href="/sign-up">
              <Button size="sm">
                Sign up free
                <ArrowRight data-icon="inline-end" className="size-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="space-y-10">
          {/* Business Identity */}
          <div>
            <p className="mb-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              AI Visibility Report
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {decodeHtmlEntities(report.businessName)}
            </h1>
            <p className="mt-1 text-base text-muted-foreground">
              {report.city}
            </p>
            {row.query_count && row.query_count < 25 && (
              <Badge variant="secondary" className="mt-2">
                Lite scan ({row.query_count} queries) —
                <Link href="/sign-up" className="ml-1 text-primary hover:underline">
                  Sign up for full analysis
                </Link>
              </Badge>
            )}
          </div>

          {/* Score Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ScoreCard
              icon={<Trophy className="size-4" />}
              label="Recommendation Score"
              value={report.recommendationScore}
              suffix="/100"
              grade={scoreGrade(report.recommendationScore, [30, 10])}
            />
            <ScoreCard
              icon={<TrendingUp className="size-4" />}
              label="Share of Voice"
              value={report.shareOfVoice}
              suffix="%"
              grade={scoreGrade(report.shareOfVoice, [20, 5])}
            />
            <ScoreCard
              icon={<Eye className="size-4" />}
              label="Queries Visible"
              value={report.strongQueries.length}
              suffix={`/${report.strongQueries.length + report.gapQueries.length}`}
              grade={scoreGrade(report.strongQueries.length, [15, 5])}
            />
          </div>

          {/* Summary */}
          <div className="border-l-2 border-primary/40 pl-5">
            <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">
              {decodeHtmlEntities(report.summary)}
            </p>
          </div>

          {/* Competitors */}
          {report.competitorMentions?.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Users className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Top Competitors in AI Search
                </h2>
              </div>
              <ol className="space-y-1">
                {report.competitorMentions
                  .slice(0, 5)
                  .map(
                    (
                      comp: { name: string; mentionCount: number },
                      i: number
                    ) => (
                      <li
                        key={comp.name}
                        className="flex items-center justify-between rounded-lg px-4 py-2.5 transition-colors hover:bg-neo-surface"
                      >
                        <span className="flex items-center gap-3 text-sm">
                          <span className="w-6 text-right font-mono text-xs text-muted-foreground">
                            {i + 1}
                          </span>
                          <span className="font-medium">{comp.name}</span>
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {comp.mentionCount}{" "}
                          {comp.mentionCount === 1 ? "mention" : "mentions"}
                        </span>
                      </li>
                    )
                  )}
              </ol>
            </section>
          )}

          {/* Gap Queries */}
          {report.gapQueries?.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <EyeOff className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Invisible Queries
                </h2>
                <Badge variant="destructive" className="ml-1 font-mono">
                  {report.gapQueries.length}
                </Badge>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {report.gapQueries
                  .slice(0, 8)
                  .map((query: string) => (
                    <div
                      key={query}
                      className="flex items-center gap-2.5 rounded-lg bg-neo-surface px-3.5 py-2.5"
                    >
                      <X className="size-3.5 shrink-0 text-neo-coral" />
                      <span className="text-sm text-muted-foreground">
                        &ldquo;{query}&rdquo;
                      </span>
                    </div>
                  ))}
              </div>
              {report.gapQueries.length > 8 && (
                <p className="text-sm text-muted-foreground">
                  + {report.gapQueries.length - 8} more queries where you are
                  not visible
                </p>
              )}
            </section>
          )}

          {/* Divider */}
          <div className="border-t border-border/50" />

          {/* GATED: Fix Recommendations */}
          <section className="relative overflow-hidden rounded-xl border border-border/50 bg-card">
            {/* Blur overlay */}
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/70 backdrop-blur-md">
              <div className="mx-auto max-w-sm text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-neo-teal-muted">
                  <Lock className="size-5 text-primary" />
                </div>
                <h3 className="mb-2 text-xl font-semibold tracking-tight">
                  Unlock {fixCount} Fix{fixCount !== 1 ? "s" : ""}
                </h3>
                <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                  Get specific, actionable recommendations to improve your AI
                  search visibility.
                </p>
                <Link href="/sign-up">
                  <Button size="lg">
                    Sign up to unlock
                    <ArrowRight data-icon="inline-end" className="size-4" />
                  </Button>
                </Link>
                {slotsLeft > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Only {slotsLeft} free slots remaining
                  </p>
                )}
              </div>
            </div>

            {/* Skeleton placeholders behind blur */}
            <div className="space-y-4 p-6">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="space-y-2.5 rounded-lg border border-border/50 bg-neo-surface p-5"
                >
                  <div className="flex items-center gap-2">
                    <div className="h-5 w-16 rounded-md bg-muted" />
                    <div className="h-5 w-20 rounded-md bg-muted" />
                  </div>
                  <div className="h-5 w-4/5 rounded-md bg-muted" />
                  <div className="space-y-1.5">
                    <div className="h-4 w-full rounded-md bg-muted/70" />
                    <div className="h-4 w-3/5 rounded-md bg-muted/70" />
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Footer timestamp */}
          <div className="flex items-center justify-center gap-1.5 text-center">
            <Clock className="size-3 text-muted-foreground" />
            <span className="font-mono text-xs text-muted-foreground">
              Scanned {formatDate(report.timestamp)}
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  ScoreCard                                                                  */
/* -------------------------------------------------------------------------- */

function ScoreCard({
  icon,
  label,
  value,
  suffix,
  grade,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  suffix: string;
  grade: Grade;
}) {
  return (
    <div
      className={`rounded-xl border-t-2 bg-card px-4 py-5 ring-1 ring-foreground/10 ${gradeBorderClass(grade)}`}
    >
      <div className="mb-3 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className={`font-mono text-3xl font-semibold tabular-nums ${gradeClass(grade)}`}
        >
          {value}
        </span>
        <span className="font-mono text-sm text-muted-foreground">
          {suffix}
        </span>
      </div>
    </div>
  );
}
