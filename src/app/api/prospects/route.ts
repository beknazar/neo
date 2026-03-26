import { NextResponse } from "next/server";
import { getProspects } from "@/lib/db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get("city") || undefined;
    const status = searchParams.get("status") || undefined;

    const prospects = await getProspects({ city, status });
    return NextResponse.json(prospects);
  } catch (error) {
    console.error("Get prospects error:", error);
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
