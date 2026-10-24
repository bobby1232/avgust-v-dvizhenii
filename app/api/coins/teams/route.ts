import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/db/client";
import { coinTransaction,changeCoins } from "@/lib/coins";
import { requireSession,jsonError,ApiError } from "@/lib/api";
import { registeredUser } from "@/lib/data";
export async function GET(){
 try{await requireSession();const r=await getPool().query("SELECT id,title,goal,balance FROM coin_team_funds WHERE active=true ORDER BY id DESC");return NextResponse.json({funds:r.rows});}
 catch(e){return jsonError(e,"coins.teams.get");}
}
export async function POST(request:Request){
 try{const session=await requireSession();const user=await registeredUser(session.id);
 const parsed=z.object({fundId:z.number().int().positive(),amount:z.number().int().min(10).max(100)}).safeParse(await request.json());
 if(!parsed.success)throw new ApiError(400,"Некорректный взнос","INVALID_CONTRIBUTION");
 const result=await coinTransaction(async c=>{
  const f=await c.query("SELECT * FROM coin_team_funds WHERE id=$1 AND active=true FOR UPDATE",[parsed.data.fundId]);
  if(!f.rowCount)throw new ApiError(404,"Копилка не найдена","NOT_FOUND");
  if(f.rows[0].balance+parsed.data.amount>f.rows[0].goal)throw new ApiError(409,"Взнос превышает остаток цели","GOAL_EXCEEDED");
  const contribution=await c.query("INSERT INTO coin_team_contributions(fund_id,user_id,amount) VALUES($1,$2,$3) RETURNING id",[parsed.data.fundId,user.id,parsed.data.amount]);
  await changeCoins(c,user.id,-parsed.data.amount,"team_fund","contribution:"+contribution.rows[0].id);
  const updated=await c.query("UPDATE coin_team_funds SET balance=balance+$2 WHERE id=$1 RETURNING balance,goal",[parsed.data.fundId,parsed.data.amount]);
  return updated.rows[0];
 });
 return NextResponse.json(result);
 }catch(e){return jsonError(e,"coins.teams.post");}
}