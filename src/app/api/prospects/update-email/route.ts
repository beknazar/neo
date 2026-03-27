import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { validateEmailDeep } from "@/lib/prospects";

export async function PATCH(request: Request) {
  const adminCheck = await requireAdmin(request);
  if (!adminCheck.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { prospectId, email } = body;

    if (!prospectId) {
      return NextResponse.json(
        { error: "prospectId is required" },
        { status: 400 }
      );
    }

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "email is required" },
        { status: 400 }
      );
    }

    const trimmed = email.trim().toLowerCase();

    // Verify prospect exists
    const prospectResult = await query(
      "SELECT id FROM prospects WHERE id = $1",
      [prospectId]
    );
    if (prospectResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Prospect not found" },
        { status: 404 }
      );
    }

    // Update email in DB
    await query(
      "UPDATE prospects SET email = $1, updated_at = NOW() WHERE id = $2",
      [trimmed, prospectId]
    );

    // Run deep validation (MX + disposable check)
    const validation = await validateEmailDeep(trimmed);

    return NextResponse.json({
      success: true,
      validation: { valid: validation.valid, reason: validation.reason },
    });
  } catch (error) {
    console.error("[update-email] error:", error);
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
