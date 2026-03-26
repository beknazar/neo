import { NextResponse } from "next/server";
import { extractBusinessInfo } from "@/lib/url-extractor";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { error: "url is required" },
        { status: 400 }
      );
    }

    const info = await extractBusinessInfo(url);

    return NextResponse.json({
      businessName: info.businessName,
      city: info.city,
      description: info.description,
      url: url.startsWith("http") ? url : `https://${url}`,
    });
  } catch (error) {
    console.error("Extract info error:", error);
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
