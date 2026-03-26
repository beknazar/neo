import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserReports } from "@/lib/db";
import { headers } from "next/headers";

export async function GET() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const reports = await getUserReports(session.user.id);
  return NextResponse.json(reports);
}
