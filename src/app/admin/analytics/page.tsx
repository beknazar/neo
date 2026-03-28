"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { ADMIN_EMAILS } from "@/lib/constants";
import { AdminNav } from "@/components/admin-nav";
import {
  BarChart3,
  Mail,
  Eye,
  UserPlus,
  ArrowRight,
  Loader2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AnalyticsData {
  funnel: {
    emailsSent: number;
    reportsViewed: number;
    signups: number;
    emailToViewRate: number;
    viewToSignupRate: number;
  };
  dailyTrends: Array<{
    date: string;
    emails_sent: number;
    reports_viewed: number;
    signups: number;
  }>;
  byVertical: Array<{
    vertical: string;
    emails_sent: number;
    reports_viewed: number;
    signups: number;
  }>;
  byCity: Array<{
    city: string;
    emails_sent: number;
    reports_viewed: number;
    signups: number;
  }>;
  recentViews: Array<{
    slug: string;
    businessName: string;
    viewedAt: string;
    viewCount: number;
  }>;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const { session, isPending } = useRequireAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const isAdmin = session?.user?.email && ADMIN_EMAILS.has(session.user.email);

  useEffect(() => {
    if (!isAdmin) return;
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isAdmin]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
              <BarChart3 className="size-4.5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight">Analytics</h1>
              <p className="text-sm text-muted-foreground">
                Conversion funnel, trends, and attribution
              </p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <div className="space-y-8">
            {/* Funnel Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
              <FunnelCard
                icon={<Mail className="size-4" />}
                label="Emails Sent"
                value={data.funnel.emailsSent}
              />
              <FunnelArrow rate={data.funnel.emailToViewRate} />
              <FunnelCard
                icon={<Eye className="size-4" />}
                label="Reports Viewed"
                value={data.funnel.reportsViewed}
              />
              <FunnelArrow rate={data.funnel.viewToSignupRate} />
              <FunnelCard
                icon={<UserPlus className="size-4" />}
                label="Signups"
                value={data.funnel.signups}
              />
            </div>

            {/* Daily Trends */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Last 30 Days
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.dailyTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickFormatter={(v) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: 12,
                      }}
                      labelFormatter={(v) => new Date(v).toLocaleDateString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="emails_sent"
                      name="Emails"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary) / 0.1)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="reports_viewed"
                      name="Views"
                      stroke="#f59e0b"
                      fill="rgba(245, 158, 11, 0.1)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="signups"
                      name="Signups"
                      stroke="#10b981"
                      fill="rgba(16, 185, 129, 0.1)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Breakdowns */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* By Vertical */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  By Vertical
                </h2>
                {data.byVertical.length > 0 ? (
                  <BreakdownTable rows={data.byVertical} labelKey="vertical" />
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                )}
              </div>

              {/* By City */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  By City
                </h2>
                {data.byCity.length > 0 ? (
                  <BreakdownTable rows={data.byCity} labelKey="city" />
                ) : (
                  <p className="text-sm text-muted-foreground">No data yet</p>
                )}
              </div>
            </div>

            {/* Recent Views */}
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Recent Report Views
              </h2>
              {data.recentViews.length > 0 ? (
                <div className="space-y-2">
                  {data.recentViews.map((view, i) => (
                    <div
                      key={`${view.slug}-${i}`}
                      className="flex items-center justify-between rounded-lg px-4 py-2.5 hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <Eye className="size-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">
                          {view.businessName || view.slug}
                        </span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-mono text-xs text-muted-foreground">
                          {view.viewCount} view{view.viewCount !== 1 ? "s" : ""}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {timeAgo(view.viewedAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No report views yet</p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground">Failed to load analytics</p>
        )}
      </main>
    </div>
  );
}

function FunnelCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-5">
      <div className="mb-2 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="font-mono text-3xl font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}

function FunnelArrow({ rate }: { rate: number }) {
  return (
    <div className="flex flex-col items-center justify-center">
      <ArrowRight className="size-4 text-muted-foreground" />
      <span className="mt-1 font-mono text-xs text-muted-foreground">{rate}%</span>
    </div>
  );
}

function BreakdownTable({
  rows,
  labelKey,
}: {
  rows: Array<Record<string, string | number>>;
  labelKey: string;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted-foreground">
          <th className="pb-2 font-medium">{labelKey === "city" ? "City" : "Vertical"}</th>
          <th className="pb-2 text-right font-medium">Sent</th>
          <th className="pb-2 text-right font-medium">Viewed</th>
          <th className="pb-2 text-right font-medium">Signups</th>
          <th className="pb-2 text-right font-medium">View %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const sent = Number(row.emails_sent);
          const viewed = Number(row.reports_viewed);
          const signups = Number(row.signups);
          const viewRate = sent > 0 ? Math.round((viewed / sent) * 100) : 0;
          return (
            <tr key={String(row[labelKey])} className="border-b border-border/50">
              <td className="py-2.5 font-medium">{String(row[labelKey])}</td>
              <td className="py-2.5 text-right font-mono text-muted-foreground">{sent}</td>
              <td className="py-2.5 text-right font-mono text-muted-foreground">{viewed}</td>
              <td className="py-2.5 text-right font-mono text-muted-foreground">{signups}</td>
              <td className="py-2.5 text-right font-mono text-muted-foreground">{viewRate}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const seconds = Math.floor((now - then) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
