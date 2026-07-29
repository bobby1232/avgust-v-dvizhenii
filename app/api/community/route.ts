import { NextResponse } from "next/server"; import { requireSession, jsonError } from "@/lib/api"; import { communityData } from "@/lib/data";
export async function GET() { try { await requireSession(); return NextResponse.json(await communityData()); } catch (error) { return jsonError(error, "community"); } }
