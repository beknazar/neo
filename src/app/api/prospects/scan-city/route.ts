import { NextResponse } from "next/server";
import { discoverMedSpas, findEmailFromWebsite } from "@/lib/prospects";
import { saveProspect, query } from "@/lib/db";

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

    // 2. Save each prospect and try to find emails
    const prospects = [];

    for (const biz of discovered) {
      // Save to prospects table
      const prospectId = await saveProspect({
        businessName: biz.businessName,
        businessUrl: biz.businessUrl,
        city,
        phone: biz.phone,
        rating: biz.rating,
        reviewCount: biz.reviewCount,
        address: biz.address,
        status: "discovered",
      });

      let email: string | null = null;

      // Try to find email from website
      if (biz.businessUrl) {
        email = await findEmailFromWebsite(biz.businessUrl);

        if (email) {
          await query(
            "UPDATE prospects SET email = $1, updated_at = NOW() WHERE id = $2",
            [email, prospectId]
          );
        }
      }

      prospects.push({
        id: prospectId,
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
