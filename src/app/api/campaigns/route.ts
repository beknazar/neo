import { NextResponse } from "next/server";
import { getCampaigns, createCampaign } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function GET(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const campaigns = await getCampaigns();
  return NextResponse.json(campaigns);
}

export async function POST(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { name, vertical, city, subjectA, bodyA, subjectB, bodyB, targetCount } = body;

    if (!name || !vertical || !city || !subjectA || !bodyA) {
      return NextResponse.json(
        { error: "name, vertical, city, subjectA, and bodyA are required" },
        { status: 400 }
      );
    }

    const id = await createCampaign({
      name, vertical, city, subjectA, bodyA, subjectB, bodyB, targetCount,
    });

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Create campaign error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create campaign" },
      { status: 500 }
    );
  }
}
