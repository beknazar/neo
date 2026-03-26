import { NextResponse } from "next/server";
import { getTotalUsers } from "@/lib/db";

export async function GET() {
  try {
    const count = await getTotalUsers();
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
