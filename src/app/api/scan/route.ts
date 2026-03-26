import { NextResponse } from "next/server";
import { generateQueries } from "@/lib/queries";
import { runQueryBatch } from "@/lib/perplexity";
import { scoreResults } from "@/lib/scorer";
import { generateFixes } from "@/lib/report-generator";
import { saveReport } from "@/lib/db";

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

    const queries = generateQueries(city);
    const results = await runQueryBatch(queries, 3, 5);
    const scanReport = scoreResults(
      results,
      businessName,
      businessUrl,
      city,
      competitors ?? []
    );
    const fullReport = await generateFixes(scanReport);

    // Save to database
    const reportId = await saveReport({
      businessName,
      businessUrl,
      city,
      recommendationScore: fullReport.recommendationScore,
      shareOfVoice: fullReport.shareOfVoice,
      totalValidRuns: fullReport.totalValidRuns,
      totalRuns: fullReport.totalRuns,
      reportData: fullReport,
    });

    return NextResponse.json({ ...fullReport, id: reportId });
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
