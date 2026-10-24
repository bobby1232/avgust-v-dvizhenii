import { NextResponse } from "next/server";
import { requireSession,jsonError } from "@/lib/api";
import { registeredUser } from "@/lib/data";
import { walletData } from "@/lib/coins";
export async function GET(){
 try { const session=await requireSession(); const user=await registeredUser(session.id); return NextResponse.json(await walletData(user.id)); }
 catch(e){return jsonError(e,"coins.get");}
}