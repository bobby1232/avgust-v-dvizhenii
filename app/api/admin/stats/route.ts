import { NextResponse } from "next/server"; import { requireAdmin, jsonError } from "@/lib/api"; import { adminStats } from "@/lib/data";
export async function GET() { try { await requireAdmin(); return NextResponse.json(await adminStats()); } catch (error) { return jsonError(error, "admin.stats"); } }
