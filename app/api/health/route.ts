import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { getPool } = await import("@/db/client");
    await getPool().query("SELECT 1");
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error(
      "[health] Database unavailable",
      error instanceof Error ? error.message : "unknown error",
    );
    return NextResponse.json({ status: "unavailable" }, { status: 503 });
  }
}
