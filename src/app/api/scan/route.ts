import { NextResponse } from "next/server";
import { generateQueries } from "@/lib/queries";
import { runQueryBatch } from "@/lib/perplexity";
import { scoreResults } from "@/lib/scorer";
import { generateFixes } from "@/lib/report-generator";
import { saveReport, initDb, generateSlug, ensureUniqueSlug } from "@/lib/db";
import { auth } from "@/lib/auth";
import { FREE_QUERY_COUNT, FREE_RUNS_PER_QUERY, FULL_QUERY_COUNT, FULL_RUNS_PER_QUERY } from "@/lib/constants";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessName, businessUrl, city, competitors } = body;

    if (!businessName || !businessUrl || !city) {
      return NextResponse.json(
        { error: "businessName, businessUrl, and city are required" },
        { status: 400 }
      );
    }

    const session = await auth.api.getSession({ headers: request.headers });
    const isAuthenticated = !!session?.user;
    const queryCount = isAuthenticated ? FULL_QUERY_COUNT : FREE_QUERY_COUNT;
    const runsPerQuery = isAuthenticated ? FULL_RUNS_PER_QUERY : FREE_RUNS_PER_QUERY;

    await initDb();

    const queries = generateQueries(city).slice(0, queryCount);
    const results = await runQueryBatch(queries, runsPerQuery, 5);
    const scanReport = scoreResults(
      results,
      businessName,
      businessUrl,
      city,
      competitors ?? []
    );
    const fullReport = await generateFixes(scanReport);

    // Save to database
    const slug = await ensureUniqueSlug(generateSlug(businessName, city));
    const reportId = await saveReport({
      businessName,
      businessUrl,
      city,
      recommendationScore: fullReport.recommendationScore,
      shareOfVoice: fullReport.shareOfVoice,
      totalValidRuns: fullReport.totalValidRuns,
      totalRuns: fullReport.totalRuns,
      reportData: fullReport,
      userId: session?.user?.id,
      slug,
      queryCount,
    });

    return NextResponse.json({ ...fullReport, id: reportId, slug });
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
