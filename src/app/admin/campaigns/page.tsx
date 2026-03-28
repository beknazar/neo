"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { ADMIN_EMAILS, CAMPAIGN_STATUS } from "@/lib/constants";
import { AdminNav } from "@/components/admin-nav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Plus,
  Play,
  Pause,
  BarChart3,
  Mail,
  MousePointer,
  Eye,
  AlertTriangle,
  X,
  Megaphone,
} from "lucide-react";

interface Campaign {
  id: string;
  name: string;
  vertical: string;
  city: string;
  status: string;
  subject_a: string;
  body_a: string;
  subject_b: string | null;
  body_b: string | null;
  target_count: number;
  sent_count: number;
  open_count: number;
  click_count: number;
  bounce_count: number;
  created_at: string;
}

const VERTICALS = [
  { value: "med spa", label: "Med Spas" },
  { value: "dentist", label: "Dentists" },
  { value: "personal injury lawyer", label: "PI Lawyers" },
  { value: "real estate agent", label: "Real Estate" },
  { value: "plastic surgeon", label: "Plastic Surgeons" },
  { value: "plumber", label: "Plumbers" },
  { value: "chiropractor", label: "Chiropractors" },
  { value: "veterinarian", label: "Veterinarians" },
];

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-primary/15 text-primary",
  paused: "bg-neo-amber/15 text-neo-amber",
  completed: "bg-primary/10 text-primary",
};

function pct(n: number, d: number): string {
  if (d === 0) return "—";
  return `${((n / d) * 100).toFixed(1)}%`;
}

export default function CampaignsPage() {
  const router = useRouter();
  const { session, isPending } = useRequireAuth();

  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [vertical, setVertical] = useState("med spa");
  const [city, setCity] = useState("");
  const [targetCount, setTargetCount] = useState(10);
  const [subjectA, setSubjectA] = useState(
    "{{businessName}} — are you visible in AI search?"
  );
  const [bodyA, setBodyA] = useState(
    `Hi,

I ran a quick AI visibility check on {{businessName}} and noticed you're not showing up in most AI search results for {{city}}.

When people ask ChatGPT or Perplexity for recommendations, your competitors are getting mentioned — but you're not.

I put together a free report with specifics:
{{reportUrl}}

Would it be helpful if I walked you through it?

Best,
Bek`
  );
  const [enableB, setEnableB] = useState(false);
  const [subjectB, setSubjectB] = useState(
    "quick question about {{businessName}}"
  );
  const [bodyB, setBodyB] = useState(
    `Hi,

Do you know if {{businessName}} shows up when people ask AI assistants for recommendations in {{city}}?

I checked — and right now, it doesn't. Your competitors are getting those mentions instead.

I have a free report that shows exactly where you're missing and how to fix it:
{{reportUrl}}

Happy to share more if useful.

Bek`
  );

  useEffect(() => {
    if (session?.user?.id) fetchCampaigns();
  }, [session?.user?.id]);

  async function fetchCampaigns() {
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setCampaigns(data);
      }
    } catch {}
  }

  async function handleCreate() {
    if (!name || !city || !subjectA || !bodyA) return;
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          vertical,
          city,
          subjectA,
          bodyA,
          subjectB: enableB ? subjectB : undefined,
          bodyB: enableB ? bodyB : undefined,
          targetCount,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create campaign");
      }

      setShowCreate(false);
      setName("");
      setCity("");
      await fetchCampaigns();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  async function handleStatusChange(id: string, status: string) {
    try {
      await fetch(`/api/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await fetchCampaigns();
    } catch {}
  }

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session?.user?.email) return null;
  if (!ADMIN_EMAILS.has(session.user.email)) {
    router.push("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />

      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Title + Create button */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
              <Megaphone className="size-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">
                Campaigns
              </h1>
              <p className="text-sm text-muted-foreground">
                Automated outreach with A/B testing
              </p>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="size-3.5" />
            New Campaign
          </Button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            <AlertTriangle className="mr-2 inline size-3.5" />
            {error}
          </div>
        )}

        {/* Campaign list */}
        {campaigns.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <Megaphone className="mb-4 size-8 text-muted-foreground/50" />
              <p className="mb-1 text-sm font-medium">No campaigns yet</p>
              <p className="text-xs text-muted-foreground">
                Create your first campaign to start automated outreach.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <Card key={c.id} className="border-border bg-card">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold">{c.name}</h3>
                        <Badge
                          className={`border-0 ${STATUS_COLORS[c.status] || STATUS_COLORS.draft}`}
                        >
                          {c.status}
                        </Badge>
                        {c.subject_b && (
                          <Badge variant="secondary" className="text-[10px]">
                            A/B
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.vertical} in {c.city} &middot; Target: {c.target_count}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {c.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(c.id, "active")}
                        >
                          <Play className="size-3" />
                          Launch
                        </Button>
                      )}
                      {c.status === "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusChange(c.id, "paused")}
                        >
                          <Pause className="size-3" />
                          Pause
                        </Button>
                      )}
                      {c.status === "paused" && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusChange(c.id, "active")}
                        >
                          <Play className="size-3" />
                          Resume
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="mt-3 flex items-center gap-6 border-t border-border/50 pt-3">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Mail className="size-3" />
                      <span className="font-mono">{c.sent_count}/{c.target_count}</span>
                      <span>sent</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Eye className="size-3" />
                      <span className="font-mono">{pct(c.open_count, c.sent_count)}</span>
                      <span>opened</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MousePointer className="size-3" />
                      <span className="font-mono">{pct(c.click_count, c.sent_count)}</span>
                      <span>clicked</span>
                    </div>
                    {c.bounce_count > 0 && (
                      <div className="flex items-center gap-1.5 text-xs text-destructive">
                        <AlertTriangle className="size-3" />
                        <span className="font-mono">{c.bounce_count}</span>
                        <span>bounced</span>
                      </div>
                    )}
                    {c.sent_count > 0 && (
                      <div className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                        <BarChart3 className="size-3" />
                        <span>
                          {Number(c.open_count) > 40 ? "Good" : Number(c.open_count) > 20 ? "Avg" : "Low"} engagement
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Create Campaign Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 pt-16 pb-16 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-2xl rounded-xl border border-border bg-card p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-semibold">New Campaign</h3>
              <button
                onClick={() => setShowCreate(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Row 1: Name + Vertical + City */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    Campaign Name
                  </Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="SF Dentists Q2"
                  />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    Vertical
                  </Label>
                  <select
                    value={vertical}
                    onChange={(e) => setVertical(e.target.value)}
                    className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {VERTICALS.map((v) => (
                      <option key={v.value} value={v.value}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">
                    City
                  </Label>
                  <Input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="San Francisco"
                  />
                </div>
              </div>

              {/* Target count */}
              <div className="w-32">
                <Label className="mb-1 block text-xs text-muted-foreground">
                  Target Emails
                </Label>
                <Input
                  type="number"
                  value={String(targetCount)}
                  onChange={(e) => setTargetCount(Number(e.target.value) || 10)}
                  min="1"
                  max="500"
                />
              </div>

              {/* Template A */}
              <div className="rounded-lg border border-border p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Badge variant="secondary">Variant A</Badge>
                  {!enableB && (
                    <button
                      onClick={() => setEnableB(true)}
                      className="text-xs text-primary hover:underline"
                    >
                      + Add Variant B for A/B testing
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">
                      Subject
                    </Label>
                    <Input
                      value={subjectA}
                      onChange={(e) => setSubjectA(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-xs text-muted-foreground">
                      Body
                    </Label>
                    <textarea
                      value={bodyA}
                      onChange={(e) => setBodyA(e.target.value)}
                      rows={8}
                      className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  </div>
                </div>
              </div>

              {/* Template B (A/B) */}
              {enableB && (
                <div className="rounded-lg border border-border p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <Badge variant="secondary">Variant B</Badge>
                    <button
                      onClick={() => setEnableB(false)}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <Label className="mb-1 block text-xs text-muted-foreground">
                        Subject
                      </Label>
                      <Input
                        value={subjectB}
                        onChange={(e) => setSubjectB(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs text-muted-foreground">
                        Body
                      </Label>
                      <textarea
                        value={bodyB}
                        onChange={(e) => setBodyB(e.target.value)}
                        rows={8}
                        className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Variable hints */}
              <p className="text-[11px] text-muted-foreground">
                Available variables:{" "}
                <code className="text-[10px]">
                  {"{{businessName}} {{city}} {{score}} {{reportUrl}}"}
                </code>
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button
                disabled={!name || !city || !subjectA || !bodyA || creating}
                onClick={handleCreate}
              >
                {creating ? (
                  <>
                    <Loader2 className="size-3 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Campaign"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
