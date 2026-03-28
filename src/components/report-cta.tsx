"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

function trackClick(slug: string, target: string) {
  try {
    const visitorId = localStorage.getItem("neo_visitor_id") || "unknown";

    // Store attribution for the signup page to pick up
    localStorage.setItem(
      "neo_attribution",
      JSON.stringify({ slug, timestamp: Date.now() })
    );

    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "report_click",
        slug,
        visitorId,
        target,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // localStorage may be unavailable
  }
}

export function ReportSignupButton({
  slug,
  target,
  size = "sm",
  variant,
  children,
}: {
  slug: string;
  target: string;
  size?: "sm" | "lg" | "default";
  variant?: "default" | "outline" | "ghost";
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <Button
      size={size}
      variant={variant}
      onClick={() => {
        trackClick(slug, target);
        router.push("/sign-up");
      }}
    >
      {children}
    </Button>
  );
}

export function ReportSignupLink({
  slug,
  target,
  className,
  children,
}: {
  slug: string;
  target: string;
  className?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        trackClick(slug, target);
        router.push("/sign-up");
      }}
    >
      {children}
    </button>
  );
}
