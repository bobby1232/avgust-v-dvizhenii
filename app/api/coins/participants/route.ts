import {NextResponse} from "next/server";
import {getPool} from "@/db/client";
import {requireSession,jsonError} from "@/lib/api";
import {registeredUser} from "@/lib/data";
export async function GET(){
 try{
  const session=await requireSession();const me=await registeredUser(session.id);
  const result=await getPool().query("SELECT id,display_name AS name FROM users WHERE is_active=true AND id<>$1 ORDER BY display_name LIMIT 250",[me.id]);
  return NextResponse.json({participants:result.rows});
 }catch(e){return jsonError(e,"coins.participants");}
}