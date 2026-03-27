import { NextResponse } from "next/server";
import { discoverBusinesses, findEmailAdvanced } from "@/lib/prospects";
import { saveProspect } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { PROSPECT_STATUS } from "@/lib/constants";

export const maxDuration = 300;

export async function POST(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { city, limit, vertical } = body;

    if (!city) {
      return NextResponse.json(
        { error: "city is required" },
        { status: 400 }
      );
    }

    const discovered = await discoverBusinesses(city, vertical, limit || 10);

    // 2. Find emails in parallel batches, then save once per prospect
    const CONCURRENCY = 5;
    const prospects = [];

    for (let i = 0; i < discovered.length; i += CONCURRENCY) {
      const batch = discovered.slice(i, i + CONCURRENCY);
      const results = await Promise.all(batch.map(async (biz) => {
        let email: string | null = null;
        email = await findEmailAdvanced(biz.businessName, biz.businessUrl, city);
        const prospectId = await saveProspect({
          businessName: biz.businessName,
          businessUrl: biz.businessUrl,
          city,
          phone: biz.phone,
          rating: biz.rating,
          reviewCount: biz.reviewCount,
          address: biz.address,
          email,
          status: PROSPECT_STATUS.DISCOVERED,
        });
        return { id: prospectId, ...biz, email, city, status: PROSPECT_STATUS.DISCOVERED };
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
