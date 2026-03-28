"use client";

import { useEffect, useMemo, useState } from "react";
import { decodeHtmlEntities as decodeHtml } from "@/lib/text";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { usePostHog } from "posthog-js/react";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { PROSPECT_STATUS, type ProspectStatus, ADMIN_EMAILS } from "@/lib/constants";
import { scoreGrade, gradeClass } from "@/lib/scoring";
import { AdminNav } from "@/components/admin-nav";
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
  Loader2,
  AlertCircle,
  CheckCircle2,
  Hash,
  X,
  Eye,
  Pencil,
  Activity,
} from "lucide-react";

const US_CITIES = [
  "New York", "Los Angeles", "Chicago", "Houston", "Phoenix",
  "Philadelphia", "San Antonio", "San Diego", "Dallas", "Austin",
  "San Jose", "Jacksonville", "Fort Worth", "Columbus", "Charlotte",
  "Indianapolis", "San Francisco", "Seattle", "Denver", "Nashville",
  "Washington DC", "Oklahoma City", "El Paso", "Boston", "Portland",
  "Las Vegas", "Memphis", "Louisville", "Baltimore", "Milwaukee",
  "Albuquerque", "Tucson", "Fresno", "Sacramento", "Mesa",
  "Kansas City", "Atlanta", "Omaha", "Colorado Springs", "Raleigh",
  "Long Beach", "Virginia Beach", "Miami", "Oakland", "Minneapolis",
  "Tampa", "Tulsa", "Arlington", "New Orleans", "Cleveland",
];

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

interface EmailStats {
  sent_at: string;
  opened_at: string | null;
  clicked_at: string | null;
  bounced: boolean;
  subject: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

type DiscoverStatus = "idle" | "discovering" | "done" | "error";

/** Prospect has email, no report yet, and hasn't been emailed/signed up. */
function isScannable(p: Prospect): boolean {
  return !!(p.email && !p.scan_report_id &&
    p.status !== PROSPECT_STATUS.EMAILED &&
    p.status !== PROSPECT_STATUS.SIGNED_UP);
}

const STATUS_CONFIG: Record<string, { bg: string; dot: string; label: string }> = {
  [PROSPECT_STATUS.DISCOVERED]: { bg: "bg-muted text-muted-foreground", dot: "bg-muted-foreground", label: "Discovered" },
  [PROSPECT_STATUS.SCANNED]: { bg: "bg-primary/10 text-primary", dot: "bg-primary", label: "Scanned" },
  [PROSPECT_STATUS.EMAILED]: { bg: "bg-neo-amber/15 text-neo-amber", dot: "bg-neo-amber", label: "Emailed" },
  [PROSPECT_STATUS.SIGNED_UP]: { bg: "bg-primary/15 text-primary font-semibold", dot: "bg-primary", label: "Signed Up" },
};

function StarRating({ rating }: { rating: number | string }) {
  const num = Number(rating);
  if (isNaN(num)) return null;
  const full = Math.floor(num);
  const hasHalf = num - full >= 0.25 && num - full < 0.75;
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
        {num.toFixed(1)}
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
  const posthog = usePostHog();

  const [city, setCity] = useState("");
  const [vertical, setVertical] = useState("med spa");
  const [limit, setLimit] = useState(10);
  const [discoverStatus, setDiscoverStatus] = useState<DiscoverStatus>("idle");
  const [discoverError, setDiscoverError] = useState("");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailModal, setEmailModal] = useState<{
    prospectId: string;
    to: string;
    businessName: string;
    subject: string;
    body: string;
  } | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [savedEmailId, setSavedEmailId] = useState<string | null>(null);
  const [emailValidations, setEmailValidations] = useState<
    Record<string, { valid: boolean; reason?: string; validating?: boolean }>
  >({});
  const [scanningIds, setScanningIds] = useState<Set<string>>(new Set());
  const [scanAllProgress, setScanAllProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [emailStats, setEmailStats] = useState<Record<string, EmailStats>>({});
  const [filterCity, setFilterCity] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  async function fetchEmailStats(prospectId: string) {
    try {
      const res = await fetch(
        `/api/prospects/email-stats?prospectId=${encodeURIComponent(prospectId)}`
      );
      if (res.ok) {
        const data: EmailStats = await res.json();
        setEmailStats((prev) => ({ ...prev, [prospectId]: data }));
      }
    } catch {
      // silently fail — stats are non-critical
    }
  }

  useEffect(() => {
    if (session?.user?.id) {
      fetchProspects();
    }
  }, [session?.user?.id]);

  // Batch-fetch email stats for all emailed prospects
  useEffect(() => {
    const emailedIds = prospects
      .filter((p) => p.status === PROSPECT_STATUS.EMAILED)
      .map((p) => p.id);
    if (emailedIds.length === 0) return;

    (async () => {
      try {
        const res = await fetch(
          `/api/prospects/email-stats?ids=${emailedIds.join(",")}`
        );
        if (res.ok) {
          const { stats } = await res.json();
          if (stats) setEmailStats((prev) => ({ ...prev, ...stats }));
        }
      } catch {
        // non-critical
      }
    })();
  }, [prospects]);

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

  /** Trigger a scan for one prospect. Returns true on success. */
  async function scanProspect(prospectId: string): Promise<boolean> {
    setScanningIds((prev) => new Set(prev).add(prospectId));
    try {
      const res = await fetch("/api/prospects/send-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Scan failed");
      }
      return true;
    } finally {
      setScanningIds((prev) => {
        const next = new Set(prev);
        next.delete(prospectId);
        return next;
      });
    }
  }

  async function handleScan(prospectId: string) {
    const name = prospects.find((p) => p.id === prospectId)?.business_name;
    try {
      await scanProspect(prospectId);
      await fetchProspects();
      toast.success(`Scan complete for ${name ? decodeHtml(name) : "prospect"}`);
      posthog?.capture("prospect_scanned", { prospect_id: prospectId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Scan failed");
    }
  }

  async function handleScanAll() {
    const unscanned = prospects.filter(isScannable);
    if (unscanned.length === 0) {
      toast.info("No un-scanned prospects with emails to scan");
      return;
    }

    setScanAllProgress({ current: 0, total: unscanned.length });

    for (let i = 0; i < unscanned.length; i++) {
      setScanAllProgress({ current: i + 1, total: unscanned.length });
      try {
        await scanProspect(unscanned[i].id);
      } catch (err) {
        toast.error(
          `Scan failed for ${decodeHtml(unscanned[i].business_name)}: ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
      }
    }

    await fetchProspects();
    setScanAllProgress(null);
    toast.success(`Scanned ${unscanned.length} prospects`);
    posthog?.capture("prospects_scan_all", { count: unscanned.length });
  }

  async function handleDiscover() {
    if (!city) return;

    setDiscoverStatus("discovering");
    setDiscoverError("");

    try {
      const res = await fetch("/api/prospects/scan-city", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, limit, vertical }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Discovery failed");
      }

      const data = await res.json();
      const count = Array.isArray(data.prospects) ? data.prospects.length : 0;
      setDiscoverStatus("done");
      setFilterCity(city);
      await fetchProspects();
      toast.success(`Found ${count} businesses`);
      posthog?.capture('prospect_discovered', { city, vertical, count });
    } catch (err) {
      setDiscoverError(
        err instanceof Error ? err.message : "Something went wrong"
      );
      setDiscoverStatus("error");
    }
  }

  async function handlePreviewEmail(prospectId: string) {
    setPreviewingId(prospectId);
    setEmailError(null);

    const prospect = prospects.find((p) => p.id === prospectId);

    try {
      const res = await fetch("/api/prospects/send-email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load preview");
      }

      const data = await res.json();
      setEmailModal({ prospectId, ...data });
      posthog?.capture('email_preview_opened', { prospect_id: prospectId, has_scan_report: !!prospect?.scan_report_id });
    } catch (err) {
      setEmailError(
        err instanceof Error ? err.message : "Failed to load preview"
      );
    } finally {
      setPreviewingId(null);
    }
  }

  async function handleSendEmail() {
    if (!emailModal) return;
    const { prospectId, subject, body } = emailModal;

    setSendingIds((prev) => new Set(prev).add(prospectId));
    setEmailError(null);

    try {
      const res = await fetch("/api/prospects/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId, subject, emailBody: body }),
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
      setEmailModal(null);
      toast.success(`Email sent to ${emailModal.to}`);
      posthog?.capture('email_sent', { prospect_id: emailModal.prospectId });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Failed to send email";
      setEmailError(reason);
      toast.error(`Failed to send: ${reason}`);
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(prospectId);
        return next;
      });
    }
  }

  function startEditingEmail(prospect: Prospect) {
    setEditingEmailId(prospect.id);
    setEditingEmailValue(prospect.email || "");
  }

  function cancelEditingEmail() {
    setEditingEmailId(null);
    setEditingEmailValue("");
  }

  async function saveEmail(prospectId: string) {
    const trimmed = editingEmailValue.trim();
    if (!trimmed) {
      cancelEditingEmail();
      return;
    }

    setEmailSaving(true);

    // Optimistic update
    setProspects((prev) =>
      prev.map((p) =>
        p.id === prospectId ? { ...p, email: trimmed } : p
      )
    );

    // Mark as validating
    setEmailValidations((prev) => ({
      ...prev,
      [prospectId]: { valid: true, validating: true },
    }));

    setEditingEmailId(null);
    setEditingEmailValue("");

    try {
      const res = await fetch("/api/prospects/update-email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prospectId, email: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update email");
      }

      const data = await res.json();

      // Update validation status
      setEmailValidations((prev) => ({
        ...prev,
        [prospectId]: {
          valid: data.validation.valid,
          reason: data.validation.reason,
          validating: false,
        },
      }));

      // Show brief "Saved" indicator
      setSavedEmailId(prospectId);
      setTimeout(() => setSavedEmailId(null), 1500);
      posthog?.capture('email_edited', { prospect_id: prospectId });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update email"
      );
      // Revert optimistic update
      await fetchProspects();
      setEmailValidations((prev) => {
        const next = { ...prev };
        delete next[prospectId];
        return next;
      });
    } finally {
      setEmailSaving(false);
    }
  }

  const availableCities = useMemo(
    () => Array.from(new Set(prospects.map((p) => p.city))).sort(),
    [prospects]
  );

  const filteredProspects = useMemo(
    () =>
      prospects.filter(
        (p) =>
          (filterCity === "all" || p.city === filterCity) &&
          (filterStatus === "all" || p.status === filterStatus)
      ),
    [prospects, filterCity, filterStatus]
  );

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

  if (!session?.user?.email) return null;

  const isAdmin = ADMIN_EMAILS.has(session.user.email);
  if (!isAdmin) {
    router.push("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

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
                Discover businesses, find emails, and send outreach
              </p>
            </div>
          </div>
        </div>

        {/* Discovery Card */}
        <Card className="mb-8 border-border bg-card">
          <CardContent className="pt-5 pb-5">
            <div className="mb-4 flex items-center gap-2">
              <Search className="size-4 text-primary" />
              <h2 className="text-sm font-semibold">Discover Businesses</h2>
            </div>
            <div className="flex items-end gap-3">
              <div className="w-40">
                <Label className="mb-1.5 block text-xs text-muted-foreground">
                  Vertical
                </Label>
                <select
                  value={vertical}
                  onChange={(e) => setVertical(e.target.value)}
                  className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="med spa">Med Spas</option>
                  <option value="dentist">Dentists</option>
                  <option value="personal injury lawyer">PI Lawyers</option>
                  <option value="real estate agent">Real Estate</option>
                  <option value="plastic surgeon">Plastic Surgeons</option>
                  <option value="plumber">Plumbers</option>
                </select>
              </div>
              <div className="min-w-0 flex-1">
                <Label
                  htmlFor="discover-city"
                  className="mb-1.5 block text-xs text-muted-foreground"
                >
                  City
                </Label>
                <Input
                  id="discover-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Start typing a city..."
                  list="city-list"
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
                <datalist id="city-list">
                  {US_CITIES.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              <div className="w-20">
                <Label
                  htmlFor="discover-limit"
                  className="mb-1.5 block text-xs text-muted-foreground"
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
              <h2 className="text-sm font-semibold">
                {filterCity !== "all" || filterStatus !== "all" ? "Filtered Prospects" : "All Prospects"}
              </h2>
              <span className="text-xs tabular-nums text-muted-foreground">
                {filteredProspects.length}{filteredProspects.length !== prospects.length ? ` of ${prospects.length}` : ""} total
              </span>
            </div>
            {prospects.length > 0 && (
              <div className="flex items-center gap-3">
                {prospects.some(isScannable) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={scanAllProgress != null}
                    onClick={handleScanAll}
                  >
                    {scanAllProgress != null ? (
                      <>
                        <Loader2 className="size-3 animate-spin" />
                        Scanning {scanAllProgress.current}/{scanAllProgress.total}...
                      </>
                    ) : (
                      <>
                        <Activity className="size-3" />
                        Scan All
                      </>
                    )}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Filter chips */}
          {prospects.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              {/* City filters */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">City:</span>
                <Badge
                  variant={filterCity === "all" ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setFilterCity("all")}
                >
                  All
                </Badge>
                {availableCities.map((c) => (
                  <Badge
                    key={c}
                    variant={filterCity === c ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setFilterCity(filterCity === c ? "all" : c)}
                  >
                    {c}
                  </Badge>
                ))}
              </div>

              {/* Status filters */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Status:</span>
                <Badge
                  variant={filterStatus === "all" ? "default" : "outline"}
                  className="cursor-pointer text-xs"
                  onClick={() => setFilterStatus("all")}
                >
                  All
                </Badge>
                {Object.entries(statusCounts).map(([status, count]) => (
                  <Badge
                    key={status}
                    variant={filterStatus === status ? "default" : "outline"}
                    className="cursor-pointer text-xs"
                    onClick={() => setFilterStatus(filterStatus === status ? "all" : status)}
                  >
                    <span
                      className={`inline-block size-1.5 rounded-full ${
                        STATUS_CONFIG[status]?.dot || STATUS_CONFIG[PROSPECT_STATUS.DISCOVERED].dot
                      }`}
                    />
                    {count} {STATUS_CONFIG[status]?.label || status}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {filteredProspects.length === 0 ? (
            /* Empty state */
            <Card className="border-dashed border-border bg-card">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
                  <MapPin className="size-5 text-muted-foreground" />
                </div>
                {prospects.length === 0 ? (
                  <>
                    <p className="mb-1 text-sm font-medium">
                      No prospects yet
                    </p>
                    <p className="text-center text-xs text-muted-foreground">
                      Enter a city above and hit Discover to find businesses in that
                      area.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mb-1 text-sm font-medium">
                      No matching prospects
                    </p>
                    <p className="text-center text-xs text-muted-foreground">
                      Try adjusting your city or status filters.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          ) : (
            /* Prospect rows */
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              {filteredProspects.map((p, index) => (
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
                        {decodeHtml(p.business_name)}
                      </h3>
                      <Badge
                        className={`shrink-0 border-0 ${
                          STATUS_CONFIG[p.status]?.bg || STATUS_CONFIG[PROSPECT_STATUS.DISCOVERED].bg
                        }`}
                      >
                        {STATUS_CONFIG[p.status]?.label || p.status}
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

                      {editingEmailId === p.id ? (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="size-3 text-muted-foreground" />
                          <Input
                            className="h-7 w-48 text-xs"
                            value={editingEmailValue}
                            onChange={(e) => setEditingEmailValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                saveEmail(p.id);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEditingEmail();
                              }
                            }}
                            onBlur={() => cancelEditingEmail()}
                            autoFocus
                            onFocus={(e) => e.target.select()}
                            placeholder="email@example.com"
                            disabled={emailSaving}
                          />
                        </span>
                      ) : p.email ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Mail className="size-3" />
                          {p.email}
                          {savedEmailId === p.id ? (
                            <span className="ml-0.5 animate-in fade-in text-primary text-xs font-medium">
                              Saved ✓
                            </span>
                          ) : (
                            <>
                              {/* Validation dot */}
                              {emailValidations[p.id] && (
                                <span
                                  className={`ml-0.5 inline-block size-2 rounded-full ${
                                    emailValidations[p.id].validating
                                      ? "bg-neo-amber animate-pulse"
                                      : emailValidations[p.id].valid
                                        ? emailValidations[p.id].reason
                                          ? "bg-neo-amber"
                                          : "bg-primary"
                                        : "bg-destructive"
                                  }`}
                                  title={
                                    emailValidations[p.id].validating
                                      ? "Validating..."
                                      : emailValidations[p.id].valid
                                        ? emailValidations[p.id].reason || "Verified"
                                        : emailValidations[p.id].reason || "Invalid"
                                  }
                                />
                              )}
                              <button
                                onClick={() => startEditingEmail(p)}
                                className="ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                              >
                                <Pencil className="size-3" />
                              </button>
                            </>
                          )}
                        </span>
                      ) : (
                        <button
                          onClick={() => startEditingEmail(p)}
                          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Mail className="size-3" />
                          Add email
                        </button>
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
                    {/* Has email, no report: show Scan button */}
                    {isScannable(p) && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={scanningIds.has(p.id)}
                          onClick={() => handleScan(p.id)}
                        >
                          {scanningIds.has(p.id) ? (
                            <>
                              <Loader2 className="size-3 animate-spin" />
                              Scanning...
                            </>
                          ) : (
                            <>
                              <Activity className="size-3" />
                              Scan
                            </>
                          )}
                        </Button>
                      )}
                    {/* Has report: show View Report */}
                    {p.scan_report_id && (
                      <Link href={`/report/${p.scan_report_id}`}>
                        <Button variant="ghost" size="sm">
                          View Report
                        </Button>
                      </Link>
                    )}
                    {/* Has email + report + not yet emailed: show Preview Email */}
                    {p.email &&
                      p.scan_report_id &&
                      p.status !== PROSPECT_STATUS.EMAILED &&
                      p.status !== PROSPECT_STATUS.SIGNED_UP && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={previewingId === p.id}
                          onClick={() => handlePreviewEmail(p.id)}
                        >
                          {previewingId === p.id ? (
                            <>
                              <Loader2 className="size-3 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            <>
                              <Eye className="size-3" />
                              Preview Email
                            </>
                          )}
                        </Button>
                      )}
                    {/* Emailed: show stats */}
                    {p.status === PROSPECT_STATUS.EMAILED && (
                      <div className="flex items-center gap-2">
                        {emailStats[p.id] ? (
                          <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Send className="size-3" />
                              Sent {timeAgo(emailStats[p.id].sent_at)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span
                                className={`inline-block size-1.5 rounded-full ${
                                  emailStats[p.id].opened_at
                                    ? "bg-primary"
                                    : "bg-muted-foreground/30"
                                }`}
                              />
                              <span className={emailStats[p.id].opened_at ? "text-primary" : ""}>
                                Opened
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span
                                className={`inline-block size-1.5 rounded-full ${
                                  emailStats[p.id].clicked_at
                                    ? "bg-primary"
                                    : "bg-muted-foreground/30"
                                }`}
                              />
                              <span className={emailStats[p.id].clicked_at ? "text-primary" : ""}>
                                Clicked
                              </span>
                            </span>
                            {emailStats[p.id].bounced && (
                              <span className="inline-flex items-center gap-1 text-destructive">
                                <span className="inline-block size-1.5 rounded-full bg-destructive" />
                                Bounced
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <CheckCircle2 className="size-3" />
                            Sent
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Email Preview Modal */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Email to {decodeHtml(emailModal.businessName)}
              </h3>
              <button
                onClick={() => setEmailModal(null)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">
                  To
                </Label>
                <div className="rounded-md bg-muted/50 px-3 py-1.5 font-mono text-xs text-muted-foreground">
                  {emailModal.to}
                </div>
              </div>

              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">
                  Subject
                </Label>
                <Input
                  value={emailModal.subject}
                  onChange={(e) =>
                    setEmailModal((m) =>
                      m ? { ...m, subject: e.target.value } : null
                    )
                  }
                />
              </div>

              <div>
                <Label className="mb-1 block text-xs text-muted-foreground">
                  Body
                </Label>
                <textarea
                  value={emailModal.body}
                  onChange={(e) =>
                    setEmailModal((m) =>
                      m ? { ...m, body: e.target.value } : null
                    )
                  }
                  rows={12}
                  className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEmailModal(null)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={sendingIds.has(emailModal.prospectId)}
                onClick={handleSendEmail}
              >
                {sendingIds.has(emailModal.prospectId) ? (
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
