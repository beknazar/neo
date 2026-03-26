"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { NeoReport } from "@/lib/report-generator";

export default function DashboardPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [reports, setReports] = useState<Array<{
    id: string;
    business_name: string;
    city: string;
    recommendation_score: number;
    share_of_voice: number;
    created_at: string;
  }>>([]);
  const [activeReport, setActiveReport] = useState<(NeoReport & { id: string }) | null>(null);

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/sign-in");
    }
  }, [session, isPending, router]);

  useEffect(() => {
    if (session) {
      fetch("/api/reports")
        .then((r) => r.json())
        .then((data) => {
          if (Array.isArray(data)) setReports(data);
        })
        .catch(() => {});
    }
  }, [session]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
              N
            </div>
            <span className="text-lg font-semibold tracking-tight">Neo</span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {session.user.email}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await authClient.signOut();
                router.push("/");
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Your Reports</h1>
          <Link href="/">
            <Button className="bg-emerald-600 text-white hover:bg-emerald-500">
              New Scan
            </Button>
          </Link>
        </div>

        {activeReport ? (
          <div className="space-y-6">
            <Button variant="outline" size="sm" onClick={() => setActiveReport(null)}>
              Back to reports
            </Button>
            <FullReport report={activeReport} />
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="mb-2 text-muted-foreground">No scans yet</p>
              <Link href="/">
                <Button className="bg-emerald-600 text-white hover:bg-emerald-500">
                  Run your first scan
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {reports.map((r) => (
              <Card
                key={r.id}
                className="cursor-pointer transition-colors hover:bg-muted/50"
                onClick={async () => {
                  const res = await fetch(`/api/reports/${r.id}`);
                  const data = await res.json();
                  if (data.report_data) {
                    setActiveReport({ ...data.report_data, id: data.id });
                  }
                }}
              >
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <h3 className="font-medium">{r.business_name}</h3>
                    <p className="text-sm text-muted-foreground">{r.city}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className={`text-lg font-bold tabular-nums ${r.recommendation_score >= 30 ? "text-emerald-600" : r.recommendation_score >= 10 ? "text-yellow-600" : "text-red-600"}`}>
                        {r.recommendation_score}/100
                      </div>
                      <div className="text-xs text-muted-foreground">Score</div>
                    </div>
                    <Badge variant="secondary" className="font-mono">
                      {r.share_of_voice}% SoV
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function FullReport({ report }: { report: NeoReport & { id: string } }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">{report.businessName}</h2>
        <p className="text-muted-foreground">{report.city}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="py-4 text-center">
            <div className={`text-3xl font-bold tabular-nums ${report.recommendationScore >= 30 ? "text-emerald-600" : report.recommendationScore >= 10 ? "text-yellow-600" : "text-red-600"}`}>
              {report.recommendationScore}<span className="text-base font-normal text-muted-foreground">/100</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Recommendation Score</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className={`text-3xl font-bold tabular-nums ${report.shareOfVoice >= 20 ? "text-emerald-600" : "text-yellow-600"}`}>
              {report.shareOfVoice}<span className="text-base font-normal text-muted-foreground">%</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Share of Voice</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-3xl font-bold tabular-nums">
              {report.strongQueries?.length || 0}<span className="text-base font-normal text-muted-foreground">/{(report.strongQueries?.length || 0) + (report.gapQueries?.length || 0)}</span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">Queries Visible</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">{report.summary}</p>
        </CardContent>
      </Card>

      {report.gapQueries?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Invisible Queries <Badge variant="destructive" className="ml-2">{report.gapQueries.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {report.gapQueries.map((q: string) => (
              <div key={q} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="text-destructive">x</span> &ldquo;{q}&rdquo;
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* FULL fixes visible for logged-in users */}
      {report.fixes?.length > 0 && (
        <div>
          <h3 className="mb-4 text-lg font-semibold">Fix Recommendations</h3>
          <div className="space-y-3">
            {report.fixes.map((fix: { priority: string; category: string; title: string; description: string }, i: number) => (
              <Card key={i}>
                <CardContent className="pt-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant={fix.priority === "high" ? "destructive" : "secondary"} className="text-xs">{fix.priority}</Badge>
                    <Badge variant="outline" className="text-xs">{fix.category}</Badge>
                  </div>
                  <h4 className="mb-1 font-medium">{fix.title}</h4>
                  <p className="whitespace-pre-line text-sm text-muted-foreground">{fix.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
