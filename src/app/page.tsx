"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import type { NeoReport } from "@/lib/report-generator";

type ScanStatus = "idle" | "scanning" | "done" | "error";

export default function Home() {
  const [businessName, setBusinessName] = useState("");
  const [businessUrl, setBusinessUrl] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [report, setReport] = useState<NeoReport | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

  async function handleScan() {
    if (!businessName || !businessUrl || !city) return;

    setStatus("scanning");
    setError("");
    setReport(null);
    setProgress(0);

    // Simulate progress while scan runs
    const interval = setInterval(() => {
      setProgress((p) => Math.min(p + 2, 90));
    }, 1000);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, businessUrl, city }),
      });

      clearInterval(interval);

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Scan failed");
      }

      const data = await res.json();
      setProgress(100);
      setReport(data);
      setStatus("done");
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
              N
            </div>
            <span className="text-lg font-semibold tracking-tight">Neo</span>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            AI Recommendation Capture
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Hero */}
        {status === "idle" && !report && (
          <div className="mb-10 text-center">
            <h2 className="mb-3 text-3xl font-semibold tracking-tight">
              Are you visible to AI search?
            </h2>
            <p className="mx-auto max-w-lg text-muted-foreground">
              Only 1.2% of businesses get recommended by ChatGPT. See where your
              med spa ranks across AI engines and get specific fixes.
            </p>
          </div>
        )}

        {/* Scanning State */}
        {status === "scanning" && (
          <Card className="mx-auto max-w-lg">
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-emerald-600">
                <svg
                  className="h-6 w-6 animate-spin text-emerald-500"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              </div>
              <div className="text-center">
                <p className="font-medium">Scanning AI engines...</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Running 25 queries x 3 runs across Perplexity
                </p>
              </div>
              <div className="w-full max-w-xs">
                <Progress value={progress} className="h-2" />
              </div>
              <p className="font-mono text-xs text-muted-foreground">
                This takes 2-5 minutes
              </p>
            </CardContent>
          </Card>
        )}

        {/* Input Form */}
        {status === "idle" && !report && (
          <Card className="mx-auto max-w-lg">
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label htmlFor="name">Business Name</Label>
                <Input
                  id="name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Glow Med Spa"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="url">Website URL</Label>
                <Input
                  id="url"
                  value={businessUrl}
                  onChange={(e) => setBusinessUrl(e.target.value)}
                  placeholder="glowmedspa.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Los Angeles"
                />
              </div>

              <Button
                onClick={handleScan}
                disabled={!businessName || !businessUrl || !city}
                className="w-full bg-emerald-600 text-white hover:bg-emerald-500"
                size="lg"
              >
                Scan AI Visibility
              </Button>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Report */}
        {report && status === "done" && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-semibold">{report.businessName}</h2>
                <p className="text-muted-foreground">{report.city}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatus("idle");
                  setReport(null);
                }}
              >
                New Scan
              </Button>
            </div>

            {/* Score Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <ScoreCard
                label="Recommendation Score"
                value={report.recommendationScore}
                suffix="/100"
                grade={
                  report.recommendationScore >= 30
                    ? "good"
                    : report.recommendationScore >= 10
                      ? "warn"
                      : "bad"
                }
              />
              <ScoreCard
                label="Share of Voice"
                value={report.shareOfVoice}
                suffix="%"
                grade={
                  report.shareOfVoice >= 20
                    ? "good"
                    : report.shareOfVoice >= 5
                      ? "warn"
                      : "bad"
                }
              />
              <ScoreCard
                label="Queries Visible"
                value={report.strongQueries.length}
                suffix={`/${report.strongQueries.length + report.gapQueries.length}`}
                grade={
                  report.strongQueries.length >= 15
                    ? "good"
                    : report.strongQueries.length >= 5
                      ? "warn"
                      : "bad"
                }
              />
            </div>

            {/* Summary */}
            <Card>
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">{report.summary}</p>
              </CardContent>
            </Card>

            {/* Top Competitors */}
            {report.competitorMentions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top Competitors in AI Search</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {report.competitorMentions.slice(0, 5).map((comp, i) => (
                    <div
                      key={comp.name}
                      className="flex items-center justify-between rounded-md bg-muted px-3 py-2"
                    >
                      <span className="text-sm">
                        <span className="mr-2 font-mono text-xs text-muted-foreground">
                          #{i + 1}
                        </span>
                        {comp.name}
                      </span>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {comp.mentionCount} mentions
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Gap Queries */}
            {report.gapQueries.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Invisible Queries
                    <Badge variant="destructive" className="ml-2">
                      {report.gapQueries.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1.5">
                  {report.gapQueries.map((query) => (
                    <div
                      key={query}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <span className="text-destructive">x</span>
                      <span>&ldquo;{query}&rdquo;</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Separator />

            {/* Fix Recommendations */}
            <div>
              <h3 className="mb-4 text-lg font-semibold">Fix Recommendations</h3>
              <div className="space-y-3">
                {report.fixes.map((fix, i) => (
                  <Card key={i}>
                    <CardContent className="pt-4">
                      <div className="mb-2 flex items-center gap-2">
                        <Badge
                          variant={
                            fix.priority === "high"
                              ? "destructive"
                              : fix.priority === "medium"
                                ? "secondary"
                                : "outline"
                          }
                          className="text-xs"
                        >
                          {fix.priority}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {fix.category}
                        </Badge>
                      </div>
                      <h4 className="mb-1 font-medium">{fix.title}</h4>
                      <p className="whitespace-pre-line text-sm text-muted-foreground">
                        {fix.description}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="text-center font-mono text-xs text-muted-foreground">
              {report.totalValidRuns}/{report.totalRuns} valid responses via
              Perplexity Sonar Pro
              <br />
              {new Date(report.timestamp).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        )}
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
    good: "text-emerald-400",
    warn: "text-yellow-400",
    bad: "text-red-400",
  };

  return (
    <Card>
      <CardContent className="py-4 text-center">
        <div className={`text-3xl font-bold tabular-nums ${colors[grade]}`}>
          {value}
          <span className="text-base font-normal text-muted-foreground">
            {suffix}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
