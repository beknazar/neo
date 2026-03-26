import { NextResponse } from "next/server";
import { getProspects } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function GET(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city") || undefined;
    const status = searchParams.get("status") || undefined;

    const prospects = await getProspects({ city, status });
    return NextResponse.json(prospects);
  } catch (error) {
    console.error("Get prospects error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      },
      { status: 500 }
    );
  }
}
