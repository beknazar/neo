import { NextResponse } from "next/server";
import { discoverMedSpas, findEmailFromWebsite } from "@/lib/prospects";
import { saveProspect } from "@/lib/db";

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { city, limit } = body;

    if (!city) {
      return NextResponse.json(
        { error: "city is required" },
        { status: 400 }
      );
    }

    // 1. Discover med spas via Apify
    const discovered = await discoverMedSpas(city, limit || 10);

    // 2. Find emails in parallel batches, then save once per prospect
    const CONCURRENCY = 5;
    const prospects = [];

    for (let i = 0; i < discovered.length; i += CONCURRENCY) {
      const batch = discovered.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (biz) => {
        let email: string | null = null;
        if (biz.businessUrl) {
          email = await findEmailFromWebsite(biz.businessUrl);
        }
        const prospectId = await saveProspect({
          businessName: biz.businessName,
          businessUrl: biz.businessUrl,
          city,
          phone: biz.phone,
          rating: biz.rating,
          reviewCount: biz.reviewCount,
          address: biz.address,
          email,
          status: "discovered",
        });
        return { id: prospectId, ...biz, email, city, status: "discovered" as const };
      }));
      prospects.push(...results);
    }

    return NextResponse.json({ prospects });
  } catch (error) {
    console.error("Scan city error:", error);
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
