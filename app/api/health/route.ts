import { NextResponse } from "next/server";
export async function GET() { try { const { pool } = await import("@/db/client"); await pool.query("SELECT 1"); return NextResponse.json({ status: "ok" }); } catch (error) { console.error("[health] Database unavailable", error instanceof Error ? error.message : "unknown error"); return NextResponse.json({ status: "unavailable" }, { status: 503 }); } }
