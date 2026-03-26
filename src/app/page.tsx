"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { authClient } from "@/lib/auth-client";

type ScanStatus = "idle" | "scanning" | "done" | "error";

const FREE_SLOTS = 30;

export default function Home() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [businessName, setBusinessName] = useState("");
  const [businessUrl, setBusinessUrl] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [slotsLeft, setSlotsLeft] = useState(FREE_SLOTS);

  useEffect(() => {
    fetch("/api/slots")
      .then((r) => r.json())
      .then((d) => setSlotsLeft(Math.max(0, FREE_SLOTS - (d.count || 0))))
      .catch(() => {});
  }, []);

  async function handleScan() {
    if (!businessName || !businessUrl || !city) return;

    setStatus("scanning");
    setError("");
    setProgress(0);

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
      setStatus("done");

      // Redirect to public report page
      router.push(`/report/${data.id}`);
    } catch (err) {
      clearInterval(interval);
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
              N
            </div>
            <span className="text-lg font-semibold tracking-tight">Neo</span>
          </div>
          <div className="flex items-center gap-3">
            {/* scarcity shown on report pages + emails, not here */}
            {session ? (
              <Link href="/dashboard">
                <Button variant="outline" size="sm">Dashboard</Button>
              </Link>
            ) : (
              <div className="flex gap-2">
                <Link href="/sign-in">
                  <Button variant="outline" size="sm">Sign in</Button>
                </Link>
                <Link href="/sign-up">
                  <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500">
                    Sign up free
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Scanning State */}
        {status === "scanning" && (
          <Card className="mx-auto max-w-lg">
            <CardContent className="flex flex-col items-center gap-4 py-12">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-emerald-600">
                <svg className="h-6 w-6 animate-spin text-emerald-600" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
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
        {status !== "scanning" && (
          <>
            <div className="mb-10 text-center">
              <h2 className="mb-3 text-3xl font-semibold tracking-tight">
                Are you visible to AI search?
              </h2>
              <p className="mx-auto max-w-lg text-muted-foreground">
                Only 1.2% of businesses get recommended by ChatGPT. See where your
                med spa ranks across AI engines and get specific fixes.
              </p>
            </div>

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
                  Scan AI Visibility — Free
                </Button>

                {error && <p className="text-sm text-destructive">{error}</p>}

                {/* scarcity in emails + report page only */}
              </CardContent>
            </Card>

            {/* Social proof */}
            <div className="mx-auto mt-8 max-w-lg text-center">
              <p className="text-xs text-muted-foreground">
                Powered by Perplexity Sonar Pro. Results in under 5 minutes.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
