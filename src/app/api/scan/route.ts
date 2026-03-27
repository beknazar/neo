import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { FREE_QUERY_COUNT, FREE_RUNS_PER_QUERY, FULL_QUERY_COUNT, FULL_RUNS_PER_QUERY } from "@/lib/constants";
import { runScanForBusiness } from "@/lib/scanner";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Sanitize inputs
    const sanitize = (s: string, maxLen: number) =>
      s.replace(/<[^>]*>/g, "").trim().slice(0, maxLen);

    const businessName = sanitize(body.businessName || "", 120);
    const businessUrl = (body.businessUrl || "").trim().slice(0, 200);
    const city = sanitize(body.city || "", 60);
    const competitors = body.competitors;
    const vertical: string | undefined = body.vertical
      ? sanitize(body.vertical, 60)
      : undefined;

    if (!businessName || !businessUrl || !city) {
      return NextResponse.json(
        { error: "businessName, businessUrl, and city are required" },
        { status: 400 }
      );
    }

    // Validate URL format
    if (!/^(https?:\/\/)?[\w.-]+\.\w{2,}/.test(businessUrl)) {
      return NextResponse.json(
        { error: "Invalid website URL" },
        { status: 400 }
      );
    }

    const session = await auth.api.getSession({ headers: request.headers });
    const isAuthenticated = !!session?.user;
    const queryCount = isAuthenticated ? FULL_QUERY_COUNT : FREE_QUERY_COUNT;
    const runsPerQuery = isAuthenticated ? FULL_RUNS_PER_QUERY : FREE_RUNS_PER_QUERY;

    const report = await runScanForBusiness(
      businessName,
      businessUrl,
      city,
      queryCount,
      runsPerQuery,
      { competitors: competitors ?? [], userId: session?.user?.id, vertical }
    );

    return NextResponse.json(report);
  } catch (error) {
    console.error("Scan error:", error);
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
