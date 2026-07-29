import { NextResponse } from "next/server"; import { requireAdmin, jsonError } from "@/lib/api"; import { communityData } from "@/lib/data";
export async function GET() { try { await requireAdmin(); const { participants } = await communityData(); return NextResponse.json({ users: participants }); } catch (error) { return jsonError(error, "admin.users"); } }
