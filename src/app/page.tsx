"use client";

import { useState } from "react";
import type { NeoReport } from "@/lib/report-generator";

type ScanStatus = "idle" | "scanning" | "done" | "error";

export default function Home() {
  const [businessName, setBusinessName] = useState("");
  const [businessUrl, setBusinessUrl] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [report, setReport] = useState<NeoReport | null>(null);
  const [error, setError] = useState("");

  async function handleScan() {
    if (!businessName || !businessUrl || !city) return;

    setStatus("scanning");
    setError("");
    setReport(null);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName, businessUrl, city }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Scan failed");
      }

      const data = await res.json();
      setReport(data);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="border-b border-zinc-800 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight">
            <span className="text-emerald-400">Neo</span>
          </h1>
          <span className="text-sm text-zinc-500">
            AI Recommendation Capture
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Hero */}
        {status === "idle" && !report && (
          <div className="mb-12 text-center">
            <h2 className="mb-3 text-3xl font-semibold tracking-tight">
              Are you visible to AI search?
            </h2>
            <p className="mx-auto max-w-lg text-lg text-zinc-400">
              Only 1.2% of businesses get recommended by ChatGPT. See where your
              med spa ranks — and get specific fixes to improve.
            </p>
          </div>
        )}

        {/* Input Form */}
        {status !== "done" && (
          <div className="mx-auto max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 p-6">
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Business Name
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Glow Med Spa"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  Website URL
                </label>
                <input
                  type="text"
                  value={businessUrl}
                  onChange={(e) => setBusinessUrl(e.target.value)}
                  placeholder="glowmedspa.com"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">
                  City
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Los Angeles"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <button
                onClick={handleScan}
                disabled={
                  !businessName ||
                  !businessUrl ||
                  !city ||
                  status === "scanning"
                }
                className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "scanning" ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Scanning 25 queries across AI engines...
                  </span>
                ) : (
                  "Scan AI Visibility"
                )}
              </button>

              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}
            </div>
          </div>
        )}

        {/* Report */}
        {report && status === "done" && (
          <div className="space-y-8">
            {/* Score Overview */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{report.businessName}</h3>
                  <p className="text-sm text-zinc-400">{report.city}</p>
                </div>
                <button
                  onClick={() => {
                    setStatus("idle");
                    setReport(null);
                  }}
                  className="text-sm text-zinc-400 hover:text-zinc-200"
                >
                  New scan
                </button>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <ScoreCard
                  label="Recommendation Score"
                  value={report.recommendationScore}
                  suffix="/100"
                  color={
                    report.recommendationScore >= 30
                      ? "emerald"
                      : report.recommendationScore >= 10
                        ? "yellow"
                        : "red"
                  }
                />
                <ScoreCard
                  label="Share of Voice"
                  value={report.shareOfVoice}
                  suffix="%"
                  color={
                    report.shareOfVoice >= 20
                      ? "emerald"
                      : report.shareOfVoice >= 5
                        ? "yellow"
                        : "red"
                  }
                />
                <ScoreCard
                  label="Queries Visible"
                  value={report.strongQueries.length}
                  suffix={`/${report.strongQueries.length + report.gapQueries.length}`}
                  color={
                    report.strongQueries.length >= 15
                      ? "emerald"
                      : report.strongQueries.length >= 5
                        ? "yellow"
                        : "red"
                  }
                />
              </div>

              <p className="mt-6 text-sm text-zinc-400">{report.summary}</p>
            </div>

            {/* Top Competitors */}
            {report.competitorMentions.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                <h3 className="mb-4 text-lg font-semibold">
                  Top Competitors in AI Search
                </h3>
                <div className="space-y-2">
                  {report.competitorMentions.slice(0, 5).map((comp, i) => (
                    <div
                      key={comp.name}
                      className="flex items-center justify-between rounded-lg bg-zinc-800 px-4 py-2.5"
                    >
                      <span className="text-sm">
                        <span className="mr-2 text-zinc-500">#{i + 1}</span>
                        {comp.name}
                      </span>
                      <span className="text-sm text-zinc-400">
                        {comp.mentionCount} mentions
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Gap Queries */}
            {report.gapQueries.length > 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
                <h3 className="mb-4 text-lg font-semibold">
                  Queries Where You&apos;re Invisible
                </h3>
                <div className="space-y-1.5">
                  {report.gapQueries.map((query) => (
                    <div
                      key={query}
                      className="flex items-center gap-2 text-sm text-zinc-400"
                    >
                      <span className="text-red-400">✕</span>
                      &quot;{query}&quot;
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Fix Recommendations */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
              <h3 className="mb-4 text-lg font-semibold">
                Fix Recommendations
              </h3>
              <div className="space-y-4">
                {report.fixes.map((fix, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-zinc-700 p-4"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${
                          fix.priority === "high"
                            ? "bg-red-900/50 text-red-300"
                            : fix.priority === "medium"
                              ? "bg-yellow-900/50 text-yellow-300"
                              : "bg-zinc-700 text-zinc-300"
                        }`}
                      >
                        {fix.priority}
                      </span>
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                        {fix.category}
                      </span>
                    </div>
                    <h4 className="mb-1 font-medium">{fix.title}</h4>
                    <p className="whitespace-pre-line text-sm text-zinc-400">
                      {fix.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            {/* Data Quality */}
            <div className="text-center text-xs text-zinc-600">
              Based on {report.totalValidRuns} valid responses out of{" "}
              {report.totalRuns} total queries across Perplexity AI.
              <br />
              Scanned on{" "}
              {new Date(report.timestamp).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
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
  color,
}: {
  label: string;
  value: number;
  suffix: string;
  color: "emerald" | "yellow" | "red";
}) {
  const colors = {
    emerald: "text-emerald-400",
    yellow: "text-yellow-400",
    red: "text-red-400",
  };

  return (
    <div className="rounded-lg bg-zinc-800 p-4 text-center">
      <div className={`text-2xl font-bold ${colors[color]}`}>
        {value}
        <span className="text-base font-normal text-zinc-500">{suffix}</span>
      </div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}
