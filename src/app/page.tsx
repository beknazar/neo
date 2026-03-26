"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { authClient } from "@/lib/auth-client";
import {
  Search,
  ArrowRight,
  Globe,
  Activity,
  Radio,
  ChevronRight,
} from "lucide-react";

type ScanStatus = "idle" | "scanning" | "done" | "error";

export default function Home() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [businessName, setBusinessName] = useState("");
  const [businessUrl, setBusinessUrl] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState<ScanStatus>("idle");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);

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
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-border/50 px-6 py-3.5">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary">
              <span className="text-xs font-bold tracking-tight text-primary-foreground">
                N
              </span>
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Neo
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            {session ? (
              <Link href="/dashboard">
                <Button variant="outline" size="sm">
                  Dashboard
                  <ChevronRight className="ml-0.5 size-3 opacity-50" />
                </Button>
              </Link>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/sign-in">
                  <Button variant="ghost" size="sm">
                    Sign in
                  </Button>
                </Link>
                <Link href="/sign-up">
                  <Button size="sm">Get started</Button>
                </Link>
              </div>
            )}
          </nav>
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 flex-col justify-center px-6 py-16">
        <div className="mx-auto w-full max-w-5xl">
          {/* Scanning State */}
          {status === "scanning" && (
            <div className="mx-auto max-w-lg">
              <Card>
                <CardContent className="py-10">
                  <div className="flex flex-col items-center gap-6">
                    {/* Animated scan indicator */}
                    <div className="relative flex h-14 w-14 items-center justify-center">
                      <div className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
                      <div className="absolute inset-1 animate-pulse rounded-full bg-primary/10" />
                      <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-primary/30 bg-neo-teal-muted">
                        <Radio className="size-5 text-primary" />
                      </div>
                    </div>

                    <div className="space-y-1 text-center">
                      <p className="text-sm font-medium text-foreground">
                        Scanning AI search engines
                      </p>
                      <p className="font-mono text-xs text-muted-foreground">
                        25 queries x 3 runs across Perplexity
                      </p>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full max-w-xs space-y-2">
                      <Progress value={progress} className="h-1.5" />
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {progress}% complete
                        </span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          ~2-5 min
                        </span>
                      </div>
                    </div>

                    {/* Activity log */}
                    <div className="w-full max-w-xs rounded-md border border-border/50 bg-neo-surface px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <Activity className="size-3 animate-pulse text-primary" />
                        <span className="font-mono text-[11px] text-muted-foreground">
                          Analyzing visibility signals...
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Input Form */}
          {status !== "scanning" && (
            <div className="grid gap-16 lg:grid-cols-[1fr_minmax(0,420px)] lg:items-start lg:gap-20">
              {/* Left: Hero copy */}
              <div className="max-w-xl pt-2">
                <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-neo-surface px-2.5 py-1">
                  <Globe className="size-3 text-primary" />
                  <span className="text-[11px] font-medium text-muted-foreground">
                    AI Search Intelligence
                  </span>
                </div>

                <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-foreground lg:text-[2.75rem]">
                  Measure your visibility
                  <br />
                  in AI search engines
                </h1>

                <p className="mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                  When patients ask ChatGPT or Perplexity for med spa
                  recommendations, does your business appear? Neo scans the
                  engines that matter and tells you exactly where you stand.
                </p>

                <div className="mt-8 flex flex-col gap-3">
                  <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-neo-teal-muted">
                      <Search className="size-3 text-primary" />
                    </div>
                    <span>
                      25 real queries across AI search platforms
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-neo-teal-muted">
                      <Activity className="size-3 text-primary" />
                    </div>
                    <span>
                      Visibility score with competitive benchmarks
                    </span>
                  </div>
                  <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                    <div className="flex h-5 w-5 items-center justify-center rounded bg-neo-teal-muted">
                      <ArrowRight className="size-3 text-primary" />
                    </div>
                    <span>
                      Actionable fixes ranked by impact
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Scan form */}
              <div className="w-full">
                <Card>
                  <CardContent className="space-y-5 pt-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-xs text-muted-foreground">
                        Business Name
                      </Label>
                      <Input
                        id="name"
                        value={businessName}
                        onChange={(e) => setBusinessName(e.target.value)}
                        placeholder="Glow Med Spa"
                      />
                    </div>

                    <div className="grid grid-cols-[1fr_140px] gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="url" className="text-xs text-muted-foreground">
                          Website
                        </Label>
                        <Input
                          id="url"
                          value={businessUrl}
                          onChange={(e) => setBusinessUrl(e.target.value)}
                          placeholder="glowmedspa.com"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="city" className="text-xs text-muted-foreground">
                          City
                        </Label>
                        <Input
                          id="city"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          placeholder="Los Angeles"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={handleScan}
                      disabled={!businessName || !businessUrl || !city}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      size="lg"
                    >
                      Run AI visibility scan
                      <ArrowRight className="ml-1 size-3.5" />
                    </Button>

                    {error && (
                      <p className="text-sm text-destructive">{error}</p>
                    )}

                    <p className="text-center font-mono text-[11px] text-muted-foreground/60">
                      Free scan — results in under 5 minutes
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 px-6 py-5">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 sm:flex-row">
          <p className="font-mono text-[11px] text-muted-foreground/50">
            Currently scanning: Perplexity AI. ChatGPT and Gemini coming soon.
          </p>
          <p className="font-mono text-[11px] text-muted-foreground/40">
            Neo {new Date().getFullYear()}
          </p>
        </div>
      </footer>
    </div>
  );
}
