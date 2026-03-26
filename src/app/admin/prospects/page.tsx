"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { PROSPECT_STATUS, type ProspectStatus } from "@/lib/constants";
import { scoreGrade, gradeClass } from "@/lib/scoring";
import { NeoLogo } from "@/components/neo-logo";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MapPin,
  Mail,
  Send,
  Star,
  Globe,
  Building2,
  Search,
  LogOut,
  LayoutDashboard,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Hash,
} from "lucide-react";

interface Prospect {
  id: string;
  business_name: string;
  business_url: string;
  city: string;
  phone: string | null;
  email: string | null;
  rating: number | null;
  review_count: number | null;
  address: string | null;
  status: string;
  scan_report_id: string | null;
  recommendation_score?: number | null;
  created_at: string;
}

type DiscoverStatus = "idle" | "discovering" | "done" | "error";

const STATUS_COLORS: Record<string, string> = {
  [PROSPECT_STATUS.DISCOVERED]: "bg-muted text-muted-foreground",
  [PROSPECT_STATUS.SCANNED]: "bg-primary/10 text-primary",
  [PROSPECT_STATUS.EMAILED]: "bg-neo-amber/15 text-neo-amber",
  [PROSPECT_STATUS.SIGNED_UP]: "bg-primary/15 text-primary font-semibold",
};

const STATUS_LABELS: Record<string, string> = {
  [PROSPECT_STATUS.DISCOVERED]: "Discovered",
  [PROSPECT_STATUS.SCANNED]: "Scanned",
  [PROSPECT_STATUS.EMAILED]: "Emailed",
  [PROSPECT_STATUS.SIGNED_UP]: "Signed Up",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  [PROSPECT_STATUS.DISCOVERED]: "bg-muted-foreground",
  [PROSPECT_STATUS.SCANNED]: "bg-primary",
  [PROSPECT_STATUS.EMAILED]: "bg-neo-amber",
  [PROSPECT_STATUS.SIGNED_UP]: "bg-primary",
};

function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.25 && rating - full < 0.75;
  const empty = 5 - full - (hasHalf ? 1 : 0);

  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: full }).map((_, i) => (
        <Star
          key={`f-${i}`}
          className="size-3 fill-neo-amber text-neo-amber"
        />
      ))}
      {hasHalf && (
        <Star className="size-3 fill-neo-amber/50 text-neo-amber" />
      )}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e-${i}`} className="size-3 text-muted-foreground/30" />
      ))}
      <span className="ml-1 text-xs tabular-nums text-muted-foreground">
        {rating.toFixed(1)}
      </span>
    </span>
  );
}

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return null;

  const grade = gradeClass(scoreGrade(score, [70, 40]));

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-mono font-medium ${grade}`}
    >
      <Hash className="size-2.5" />
      {score}
    </span>
  );
}

export default function ProspectsPage() {
  const router = useRouter();
  const { session, isPending } = useRequireAuth();

  const [city, setCity] = useState("");
  const [limit, setLimit] = useState(10);
  const [discoverStatus, setDiscoverStatus] = useState<DiscoverStatus>("idle");
  const [discoverError, setDiscoverError] = useState("");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (session) {
      fetchProspects();
    }
  }, [session]);

  async function fetchProspects() {
    try {
      const res = await fetch("/api/prospects");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setProspects(data);
      }
    } catch {
      // silently fail
    }
  }

  async function handleDiscover() {
    if (!city) return;

    setDiscoverStatus("discovering");
    setDiscoverError("");

    try {
      const res = await fetch("/api/prospects/scan-city", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, limit }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Discovery failed");
      }

      setDiscoverStatus("done");
      await fetchProspects();
    } catch (err) {
      setDiscoverError(
        err instanceof Error ? err.message : "Something went wrong"
      );
      setDiscoverStatus("error");
    }
  }

  async function handleSendEmail(prospectId: string) {
    setSendingIds((prev) => new Set(prev).add(prospectId));
    setEmailError(null);

    try {
      const res = await fetch("/api/prospects/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send email");
      }

      setProspects((prev) =>
        prev.map((p) =>
          p.id === prospectId ? { ...p, status: PROSPECT_STATUS.EMAILED } : p
        )
      );
    } catch (err) {
      setEmailError(
        err instanceof Error ? err.message : "Failed to send email"
      );
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(prospectId);
        return next;
      });
    }
  }

  const statusCounts = useMemo(
    () =>
      prospects.reduce<Record<string, number>>((acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      }, {}),
    [prospects]
  );

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <NeoLogo size="xl" />
          <div className="flex items-center gap-1">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm">
                <LayoutDashboard className="size-3.5" />
                Dashboard
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await authClient.signOut();
                router.push("/");
              }}
              className="text-muted-foreground"
            >
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Page title */}
        <div className="mb-8">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="size-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Prospect Management
              </h1>
              <p className="text-sm text-muted-foreground">
                Discover med spas, find emails, and send outreach
              </p>
            </div>
          </div>
        </div>

        {/* Discovery Card */}
        <Card className="mb-8 border-border bg-card">
          <CardContent className="pt-5 pb-5">
            <div className="mb-4 flex items-center gap-2">
              <Search className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Discover Med Spas</h2>
            </div>
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label
                  htmlFor="discover-city"
                  className="text-xs text-muted-foreground"
                >
                  City
                </Label>
                <Input
                  id="discover-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g. Los Angeles, Miami, Austin..."
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      city &&
                      discoverStatus !== "discovering"
                    ) {
                      handleDiscover();
                    }
                  }}
                />
              </div>
              <div className="w-20 space-y-1.5">
                <Label
                  htmlFor="discover-limit"
                  className="text-xs text-muted-foreground"
                >
                  Limit
                </Label>
                <Input
                  id="discover-limit"
                  type="number"
                  value={String(limit)}
                  onChange={(e) => setLimit(Number(e.target.value) || 10)}
                  min="1"
                  max="50"
                />
              </div>
              <Button
                onClick={handleDiscover}
                disabled={!city || discoverStatus === "discovering"}
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {discoverStatus === "discovering" ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Discovering...
                  </>
                ) : (
                  <>
                    <Globe className="size-3.5" />
                    Discover
                  </>
                )}
              </Button>
            </div>

            {/* Status messages */}
            {discoverError && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="size-3.5 shrink-0" />
                {discoverError}
              </div>
            )}
            {discoverStatus === "discovering" && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                <div className="relative flex size-4 items-center justify-center">
                  <span className="absolute inline-flex size-3 animate-ping rounded-full bg-primary/30" />
                  <span className="relative inline-flex size-2 rounded-full bg-primary" />
                </div>
                Searching Google Maps and scraping websites for emails. This may
                take a few minutes...
              </div>
            )}
            {discoverStatus === "done" && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
                <CheckCircle2 className="size-3.5 shrink-0" />
                Discovery complete. Prospects updated below.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email error banner */}
        {emailError && (
          <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            <div className="flex items-center gap-2">
              <AlertCircle className="size-3.5 shrink-0" />
              {emailError}
            </div>
            <button
              onClick={() => setEmailError(null)}
              className="text-xs underline underline-offset-2 opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Prospects List */}
        <div>
          {/* List header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <h2 className="text-sm font-semibold">All Prospects</h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {prospects.length} total
              </span>
            </div>
            {prospects.length > 0 && (
              <div className="flex items-center gap-2">
                {Object.entries(statusCounts).map(([status, count]) => (
                  <span
                    key={status}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                  >
                    <span
                      className={`inline-block size-1.5 rounded-full ${
                        STATUS_DOT_COLORS[status] || STATUS_DOT_COLORS[PROSPECT_STATUS.DISCOVERED]
                      }`}
                    />
                    {count} {STATUS_LABELS[status] || status}
                  </span>
                ))}
              </div>
            )}
          </div>

          {prospects.length === 0 ? (
            /* Empty state */
            <Card className="border-dashed border-border bg-card">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
                  <MapPin className="size-5 text-muted-foreground" />
                </div>
                <p className="mb-1 text-sm font-medium">
                  No prospects yet
                </p>
                <p className="text-center text-xs text-muted-foreground">
                  Enter a city above and hit Discover to find med spas in that
                  area.
                </p>
              </CardContent>
            </Card>
          ) : (
            /* Prospect rows */
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {prospects.map((p, index) => (
                <div
                  key={p.id}
                  className={`group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-neo-surface ${
                    index !== 0 ? "border-t border-border" : ""
                  }`}
                >
                  {/* Main content */}
                  <div className="min-w-0 flex-1">
                    {/* Primary row: name + badge */}
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-medium">
                        {p.business_name}
                      </h3>
                      <Badge
                        className={`shrink-0 border-0 ${
                          STATUS_COLORS[p.status] || STATUS_COLORS[PROSPECT_STATUS.DISCOVERED]
                        }`}
                      >
                        {STATUS_LABELS[p.status] || p.status}
                      </Badge>
                    </div>

                    {/* Secondary row: metadata */}
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" />
                        {p.city}
                      </span>

                      {p.rating != null && <StarRating rating={p.rating} />}

                      {p.review_count != null && (
                        <span className="text-xs text-muted-foreground">
                          ({p.review_count} reviews)
                        </span>
                      )}

                      {p.email && (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="size-3" />
                          {p.email}
                        </span>
                      )}

                      {p.business_url && (
                        <a
                          href={p.business_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                        >
                          <Globe className="size-3" />
                          Website
                        </a>
                      )}

                      {p.scan_report_id && (
                        <ScoreBadge score={p.recommendation_score} />
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    {p.scan_report_id && (
                      <Link href={`/report/${p.scan_report_id}`}>
                        <Button variant="ghost" size="sm">
                          View Report
                        </Button>
                      </Link>
                    )}
                    {p.email &&
                      p.status !== PROSPECT_STATUS.EMAILED &&
                      p.status !== PROSPECT_STATUS.SIGNED_UP && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sendingIds.has(p.id)}
                          onClick={() => handleSendEmail(p.id)}
                        >
                          {sendingIds.has(p.id) ? (
                            <>
                              <Loader2 className="size-3 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send className="size-3" />
                              Send Email
                            </>
                          )}
                        </Button>
                      )}
                    {p.status === PROSPECT_STATUS.EMAILED && (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CheckCircle2 className="size-3" />
                        Sent
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
