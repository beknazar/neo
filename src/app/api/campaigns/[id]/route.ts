import { NextResponse } from "next/server";
import { getCampaign, updateCampaignStatus, getCampaignStats } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }

  const stats = await getCampaignStats(id);
  return NextResponse.json({ ...campaign, variantStats: stats });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { id } = await params;
  const body = await request.json();
  const { status } = body;

  if (!status || !["active", "paused", "completed"].includes(status)) {
    return NextResponse.json(
      { error: "Invalid status. Use: active, paused, or completed" },
      { status: 400 }
    );
  }

  await updateCampaignStatus(id, status);
  return NextResponse.json({ success: true });
}
