import { getReport, getTotalUsers } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FREE_SLOTS } from "@/lib/constants";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const row = await getReport(id);
  if (!row) notFound();

  const report = row.report_data;
  const totalUsers = await getTotalUsers();
  const slotsLeft = Math.max(0, FREE_SLOTS - totalUsers);

  return (
    <div className="min-h-screen">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
              N
            </div>
            <span className="text-lg font-semibold tracking-tight">Neo</span>
          </Link>
          <div className="flex items-center gap-3">
            {slotsLeft > 0 && (
              <Badge variant="secondary" className="text-xs">
                {slotsLeft} free slots left
              </Badge>
            )}
            <Link href="/sign-up">
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500">
                Sign up free
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="space-y-6">
          {/* Header */}
          <div>
            <h1 className="text-2xl font-semibold">{report.businessName}</h1>
            <p className="text-muted-foreground">{report.city}</p>
          </div>

          {/* Score Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <ScoreCard
              label="Recommendation Score"
              value={report.recommendationScore}
              suffix="/100"
              grade={report.recommendationScore >= 30 ? "good" : report.recommendationScore >= 10 ? "warn" : "bad"}
            />
            <ScoreCard
              label="Share of Voice"
              value={report.shareOfVoice}
              suffix="%"
              grade={report.shareOfVoice >= 20 ? "good" : report.shareOfVoice >= 5 ? "warn" : "bad"}
            />
            <ScoreCard
              label="Queries Visible"
              value={report.strongQueries.length}
              suffix={`/${report.strongQueries.length + report.gapQueries.length}`}
              grade={report.strongQueries.length >= 15 ? "good" : report.strongQueries.length >= 5 ? "warn" : "bad"}
            />
          </div>

          {/* Summary */}
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{report.summary}</p>
            </CardContent>
          </Card>

          {/* Competitors - visible */}
          {report.competitorMentions?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Competitors in AI Search</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {report.competitorMentions.slice(0, 5).map((comp: { name: string; mentionCount: number }, i: number) => (
                  <div key={comp.name} className="flex items-center justify-between rounded-md bg-muted px-3 py-2">
                    <span className="text-sm">
                      <span className="mr-2 font-mono text-xs text-muted-foreground">#{i + 1}</span>
                      {comp.name}
                    </span>
                    <Badge variant="secondary" className="font-mono text-xs">{comp.mentionCount} mentions</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Gap Queries - visible */}
          {report.gapQueries?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Invisible Queries
                  <Badge variant="destructive" className="ml-2">{report.gapQueries.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {report.gapQueries.slice(0, 5).map((query: string) => (
                  <div key={query} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="text-destructive">x</span>
                    <span>&ldquo;{query}&rdquo;</span>
                  </div>
                ))}
                {report.gapQueries.length > 5 && (
                  <p className="text-sm text-muted-foreground">
                    + {report.gapQueries.length - 5} more hidden queries
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Separator />

          {/* GATED: Fix Recommendations */}
          <Card className="relative overflow-hidden">
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center">
                <h3 className="mb-2 text-lg font-semibold">
                  {report.fixes?.length || 0} Fix Recommendations Available
                </h3>
                <p className="mb-4 max-w-sm text-sm text-muted-foreground">
                  Sign up to see exactly how to improve your AI visibility with specific, actionable fixes.
                </p>
                {slotsLeft > 0 && (
                  <p className="mb-3 text-sm font-medium text-emerald-600">
                    {slotsLeft} of {FREE_SLOTS} free slots remaining
                  </p>
                )}
                <Link href="/sign-up">
                  <Button className="bg-emerald-600 text-white hover:bg-emerald-500">
                    Sign up to unlock fixes
                  </Button>
                </Link>
              </div>
            </div>
            <CardContent className="space-y-3 pt-6">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg border p-4">
                  <div className="mb-2 flex gap-2">
                    <div className="h-5 w-12 rounded bg-muted" />
                    <div className="h-5 w-16 rounded bg-muted" />
                  </div>
                  <div className="mb-1 h-5 w-3/4 rounded bg-muted" />
                  <div className="h-4 w-full rounded bg-muted" />
                  <div className="mt-1 h-4 w-2/3 rounded bg-muted" />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="text-center font-mono text-xs text-muted-foreground">
            Scanned on{" "}
            {new Date(report.timestamp).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

function ScoreCard({
  label,
  value,
  suffix,
  grade,
}: {
  label: string;
  value: number;
  suffix: string;
  grade: "good" | "warn" | "bad";
}) {
  const colors = {
    good: "text-emerald-600",
    warn: "text-yellow-600",
    bad: "text-red-600",
  };

  return (
    <Card>
      <CardContent className="py-4 text-center">
        <div className={`text-3xl font-bold tabular-nums ${colors[grade]}`}>
          {value}
          <span className="text-base font-normal text-muted-foreground">{suffix}</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
