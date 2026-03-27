/**
 * Reusable scan logic extracted from the scan API route.
 * Runs an AI visibility scan for a business and saves the report to DB.
 */

import { generateQueries } from "@/lib/queries";
import { runQueryBatch } from "@/lib/perplexity";
import { scoreResults } from "@/lib/scorer";
import { generateFixes } from "@/lib/report-generator";
import type { NeoReport } from "@/lib/report-generator";
import { saveReport, ensureDb, generateSlug, ensureUniqueSlug } from "@/lib/db";

export interface SavedScanReport extends NeoReport {
  id: string;
  slug: string;
}

export interface ScanOptions {
  competitors?: string[];
  userId?: string;
  vertical?: string;
}

/**
 * Run a full AI visibility scan for a business, save the report to DB,
 * and return the saved report with its id and slug.
 */
export async function runScanForBusiness(
  businessName: string,
  businessUrl: string,
  city: string,
  queryCount: number,
  runsPerQuery: number,
  options?: ScanOptions
): Promise<SavedScanReport> {
  await ensureDb();

  const queries = generateQueries(city, options?.vertical).slice(0, queryCount);
  const results = await runQueryBatch(queries, runsPerQuery, 5);
  const scanReport = scoreResults(
    results,
    businessName,
    businessUrl,
    city,
    options?.competitors ?? []
  );
  const fullReport = await generateFixes(scanReport, options?.vertical as Parameters<typeof generateFixes>[1]);

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
    userId: options?.userId,
    slug,
    queryCount,
  });

  return { ...fullReport, id: reportId, slug };
}
