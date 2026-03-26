import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getReport } from "@/lib/db";
import { headers } from "next/headers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const report = await getReport(id);

  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}
