"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { scoreGrade, gradeClass, gradeBorderClass, formatDate, type Grade } from "@/lib/scoring";
import { NeoLogo } from "@/components/neo-logo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  ArrowLeft,
  Plus,
  X,
  AlertTriangle,
  Zap,
  LogOut,
  Activity,
  Eye,
  Target,
  TrendingUp,
  ChevronRight,
  Calendar,
} from "lucide-react";
import type { NeoReport } from "@/lib/report-generator";

function priorityVariant(priority: string): "destructive" | "secondary" | "outline" {
  if (priority === "high") return "destructive";
  if (priority === "medium") return "secondary";
  return "outline";
}

// ---------------------------------------------------------------------------
// Skeleton components
// ---------------------------------------------------------------------------

function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
      aria-hidden="true"
    />
  );
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <header className="border-b border-border/50 bg-neo-surface/50">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Skeleton className="h-6 w-12" />
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {/* Title bar skeleton */}
        <div className="mb-8 flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>

        {/* Report card skeletons */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-5 w-48" />
                    <Skeleton className="h-3.5 w-32" />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="space-y-1.5 text-right">
                      <Skeleton className="ml-auto h-6 w-16" />
                      <Skeleton className="ml-auto h-3 w-10" />
                    </div>
                    <Skeleton className="h-5 w-16" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const router = useRouter();
  const { session, isPending } = useRequireAuth();
  const [reports, setReports] = useState<
    Array<{
      id: string;
      slug: string | null;
      business_name: string;
      city: string;
      recommendation_score: number;
      share_of_voice: number;
      query_count: number | null;
      created_at: string;
    }>
  >([]);
  const [activeReport, setActiveReport] = useState<
    (NeoReport & { id: string }) | null
  >(null);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.user?.id) {
      fetch("/api/reports")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setReports(data);
        })
        .catch(() => {});
    }
  }, [session?.user?.id]);

  if (isPending) {
    return <DashboardSkeleton />;
  }

  if (!session?.user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-neo-surface/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <NeoLogo size="xl" />
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted-foreground font-mono sm:inline-block">
              {session.user.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={async () => {
                await authClient.signOut();
                router.push("/");
              }}
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        {activeReport ? (
          <div className="space-y-8">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground"
              onClick={() => setActiveReport(null)}
            >
              <ArrowLeft className="size-3.5" />
              Back to reports
            </Button>
            <FullReport report={activeReport} />
          </div>
        ) : (
          <>
            {/* Title bar */}
            <div className="mb-8 flex items-end justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Your Reports
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  AI visibility scans for your med spa
                </p>
              </div>
              <Link href="/">
                <Button className="gap-1.5">
                  <Plus className="size-4" />
                  New Scan
                </Button>
              </Link>
            </div>

            {/* Report list or empty state */}
            {reports.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-3">
                {reports.map((r) => (
                  <ReportCard
                    key={r.id}
                    report={r}
                    loading={loadingReportId === r.id}
                    onClick={async () => {
                      setLoadingReportId(r.id);
                      try {
                        const res = await fetch(`/api/reports/${r.id}`);
                        const data = await res.json();
                        if (data.report_data) {
                          setActiveReport({ ...data.report_data, id: data.id });
                        }
                      } finally {
                        setLoadingReportId(null);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <Card className="bg-neo-surface/50">
      <CardContent className="flex flex-col items-center py-16 text-center">
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-neo-teal-muted">
          <BarChart3 className="size-7 text-primary" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight">
          No scans yet
        </h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Run your first AI visibility scan to see how your med spa appears in
          AI search engines.
        </p>
        <Link href="/" className="mt-6">
          <Button className="gap-1.5">
            <Zap className="size-4" />
            Run your first scan
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Report list card
// ---------------------------------------------------------------------------

function ReportCard({
  report,
  loading,
  onClick,
}: {
  report: {
    id: string;
    slug: string | null;
    business_name: string;
    city: string;
    recommendation_score: number;
    share_of_voice: number;
    query_count: number | null;
    created_at: string;
  };
  loading: boolean;
  onClick: () => void;
}) {
  const grade = scoreGrade(report.recommendation_score);

  return (
    <Card
      className="group cursor-pointer transition-all duration-150 hover:ring-primary/30 hover:bg-neo-surface/60"
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`View report for ${report.business_name}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <CardContent className="py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left side: date, name, city */}
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="size-3" />
              <time dateTime={report.created_at} className="font-mono">
                {formatDate(report.created_at)}
              </time>
            </div>
            <h3 className="truncate text-base font-medium leading-tight">
              {report.business_name}
            </h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {report.city}
            </p>
          </div>

          {/* Right side: score + SoV */}
          <div className="flex items-center gap-4 shrink-0">
            <div className="text-right">
              <div
                className={`text-lg font-bold font-mono tabular-nums ${gradeClass(grade)}`}
              >
                {report.recommendation_score}
                <span className="text-xs font-normal text-muted-foreground">
                  /100
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Score
              </div>
            </div>
            <Badge variant="secondary" className="font-mono tabular-nums">
              {report.share_of_voice}% SoV
            </Badge>
            <ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Full report detail view
// ---------------------------------------------------------------------------

function FullReport({ report }: { report: NeoReport & { id: string } }) {
  const recGrade = scoreGrade(report.recommendationScore);
  const sovGrade = scoreGrade(report.shareOfVoice, [20, 10]);
  const totalQueries =
    (report.strongQueries?.length || 0) + (report.gapQueries?.length || 0);
  const visibleCount = report.strongQueries?.length || 0;
  const visibilityGrade = scoreGrade(
    totalQueries > 0 ? Math.round((visibleCount / totalQueries) * 100) : 0,
    [50, 25]
  );

  return (
    <div className="space-y-8">
      {/* Business header */}
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">
          {report.businessName}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{report.city}</p>
      </div>

      {/* ------ Score cards ------ */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <ScoreCard
          grade={recGrade}
          value={report.recommendationScore}
          suffix="/100"
          label="Recommendation Score"
          icon={<Target className="size-4" />}
        />
        <ScoreCard
          grade={sovGrade}
          value={report.shareOfVoice}
          suffix="%"
          label="Share of Voice"
          icon={<TrendingUp className="size-4" />}
        />
        <ScoreCard
          grade={visibilityGrade}
          value={visibleCount}
          suffix={`/${totalQueries}`}
          label="Queries Visible"
          icon={<Eye className="size-4" />}
        />
      </div>

      {/* ------ Summary ------ */}
      {report.summary && (
        <div className="rounded-lg bg-neo-surface/50 px-5 py-4">
          <div className="border-l-2 border-primary/40 pl-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {report.summary}
            </p>
          </div>
        </div>
      )}

      {/* ------ Gap queries ------ */}
      {report.gapQueries?.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-destructive/10">
              <AlertTriangle className="size-3.5 text-destructive" />
            </div>
            <h3 className="text-base font-semibold tracking-tight">
              Invisible Queries
            </h3>
            <Badge variant="destructive" className="font-mono tabular-nums">
              {report.gapQueries.length}
            </Badge>
          </div>
          <Card>
            <CardContent className="py-1">
              <div className="divide-y divide-border/50">
                {report.gapQueries.map((q: string) => (
                  <div
                    key={q}
                    className="flex items-center gap-3 py-2.5 text-sm"
                  >
                    <X className="size-3.5 shrink-0 text-neo-coral" />
                    <span className="text-muted-foreground">{q}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ------ Fix recommendations ------ */}
      {report.fixes?.length > 0 && (
        <section>
          <div className="mb-4 flex items-center gap-2.5">
            <div className="flex size-7 items-center justify-center rounded-lg bg-neo-teal-muted">
              <Activity className="size-3.5 text-primary" />
            </div>
            <h3 className="text-base font-semibold tracking-tight">
              Fix Recommendations
            </h3>
            <Badge variant="secondary" className="font-mono tabular-nums">
              {report.fixes.length}
            </Badge>
          </div>
          <div className="space-y-3">
            {report.fixes.map((fix, i) => (
                <Card key={i} className="bg-neo-surface/40">
                  <CardContent className="py-4">
                    <div className="mb-2.5 flex flex-wrap items-center gap-2">
                      <Badge
                        variant={priorityVariant(fix.priority)}
                        className="text-xs uppercase tracking-wide"
                      >
                        {fix.priority}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {fix.category}
                      </Badge>
                    </div>
                    <h4 className="mb-1.5 font-medium leading-snug">
                      {fix.title}
                    </h4>
                    <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {fix.description}
                    </p>
                  </CardContent>
                </Card>
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score card sub-component
// ---------------------------------------------------------------------------

function ScoreCard({
  grade,
  value,
  suffix,
  label,
  icon,
}: {
  grade: Grade;
  value: number;
  suffix: string;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className={`border-t-2 ${gradeBorderClass(grade)}`}>
      <CardContent className="py-5 text-center">
        <div className="mb-3 flex items-center justify-center gap-1.5 text-muted-foreground">
          {icon}
          <span className="text-xs uppercase tracking-wide">{label}</span>
        </div>
        <div
          className={`text-3xl font-bold font-mono tabular-nums ${gradeClass(grade)}`}
        >
          {value}
          <span className="text-base font-normal text-muted-foreground">
            {suffix}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
