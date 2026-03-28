"use client";

import { useEffect } from "react";

function getVisitorId(): string {
  const key = "neo_visitor_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

export function ReportTracker({ slug }: { slug: string }) {
  useEffect(() => {
    try {
      const visitorId = getVisitorId();
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "report_view",
          slug,
          visitorId,
          referrer: document.referrer || null,
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      // localStorage may be unavailable in private browsing
    }
  }, [slug]);

  return null;
}
