import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { ensureDb, getAnalytics } from "@/lib/db";

export async function GET(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    await ensureDb();
    const analytics = await getAnalytics();
    return NextResponse.json(analytics);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const code = (error as Record<string, unknown>)?.code;
    console.error("Analytics error:", msg, "code:", code);
    return NextResponse.json({ error: "Failed to load analytics", detail: msg, code }, { status: 500 });
  }
}
