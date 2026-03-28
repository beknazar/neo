import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { saveSignupAttribution } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { reportSlug, referrer } = body;

    await saveSignupAttribution({
      userId: session.user.id,
      reportSlug: reportSlug || undefined,
      referrer: referrer || undefined,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Attribution error:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
