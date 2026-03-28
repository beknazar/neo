import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { ensureDb, saveReportView, saveReportClick } from "@/lib/db";

const BOT_PATTERN = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|bingpreview|googlebot/i;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { event, slug, visitorId, target, referrer } = body;

    if (!event || !slug) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    await ensureDb();

    const userAgent = request.headers.get("user-agent") || "";
    if (BOT_PATTERN.test(userAgent)) {
      return NextResponse.json({ ok: true });
    }

    // Hash the IP for privacy
    const forwarded = request.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "unknown";
    const salt = process.env.TRACKING_SALT || "neo-default-salt";
    const ipHash = createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);

    if (event === "report_view") {
      await saveReportView({
        reportSlug: slug,
        visitorId: visitorId || null,
        referrer: referrer || null,
        userAgent,
        ipHash,
      });
    } else if (event === "report_click") {
      await saveReportClick({
        reportSlug: slug,
        visitorId: visitorId || null,
        clickTarget: target || "unknown",
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Track error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
