"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  discovered: "bg-gray-100 text-gray-700",
  scanned: "bg-blue-100 text-blue-700",
  emailed: "bg-yellow-100 text-yellow-700",
  signed_up: "bg-emerald-100 text-emerald-700",
};

export default function ProspectsPage() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  const [city, setCity] = useState("");
  const [limit, setLimit] = useState("10");
  const [discoverStatus, setDiscoverStatus] = useState<DiscoverStatus>("idle");
  const [discoverError, setDiscoverError] = useState("");
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [sendingIds, setSendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isPending && !session) {
      router.push("/sign-in");
    }
  }, [session, isPending, router]);

  // Load all prospects on mount
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
        body: JSON.stringify({ city, limit: parseInt(limit) || 10 }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Discovery failed");
      }

      setDiscoverStatus("done");
      // Refresh prospect list
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

      // Refresh prospects to show updated status
      await fetchProspects();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSendingIds((prev) => {
        const next = new Set(prev);
        next.delete(prospectId);
        return next;
      });
    }
  }

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
            <Link href="/dashboard">
              <Button variant="outline" size="sm">
                Dashboard
              </Button>
            </Link>
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
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Prospect Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Discover med spas, find emails, and send outreach
          </p>
        </div>

        {/* Discovery Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Discover Med Spas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-2">
                <Label htmlFor="discover-city">City</Label>
                <Input
                  id="discover-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Los Angeles"
                />
              </div>
              <div className="w-24 space-y-2">
                <Label htmlFor="discover-limit">Limit</Label>
                <Input
                  id="discover-limit"
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  min="1"
                  max="50"
                />
              </div>
              <Button
                onClick={handleDiscover}
                disabled={!city || discoverStatus === "discovering"}
                className="bg-emerald-600 text-white hover:bg-emerald-500"
              >
                {discoverStatus === "discovering"
                  ? "Discovering..."
                  : "Discover"}
              </Button>
            </div>
            {discoverError && (
              <p className="mt-2 text-sm text-destructive">{discoverError}</p>
            )}
            {discoverStatus === "discovering" && (
              <p className="mt-2 text-sm text-muted-foreground">
                Searching Google Maps and scraping websites for emails. This may
                take a few minutes...
              </p>
            )}
            {discoverStatus === "done" && (
              <p className="mt-2 text-sm text-emerald-600">
                Discovery complete! Prospects updated below.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Prospects List */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">
            All Prospects ({prospects.length})
          </h2>

          {prospects.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No prospects yet. Discover med spas in a city to get started.
                </p>
              </CardContent>
            </Card>
          ) : (
            prospects.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium">
                        {p.business_name}
                      </h3>
                      <Badge
                        className={
                          STATUS_COLORS[p.status] || STATUS_COLORS.discovered
                        }
                      >
                        {p.status}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{p.city}</span>
                      {p.rating !== null && <span>{p.rating} stars</span>}
                      {p.email && <span>{p.email}</span>}
                      {p.scan_report_id && (
                        <span className="font-mono text-xs">
                          Score: {p.recommendation_score ?? "N/A"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    {p.email &&
                      p.status !== "emailed" &&
                      p.status !== "signed_up" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={sendingIds.has(p.id)}
                          onClick={() => handleSendEmail(p.id)}
                        >
                          {sendingIds.has(p.id)
                            ? "Sending..."
                            : "Send Email"}
                        </Button>
                      )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
