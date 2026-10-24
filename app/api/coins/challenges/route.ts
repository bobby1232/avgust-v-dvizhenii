import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/db/client";
import { coinTransaction,changeCoins } from "@/lib/coins";
import { requireSession,jsonError,ApiError } from "@/lib/api";
import { registeredUser } from "@/lib/data";
export async function GET(){
 try{const session=await requireSession();const user=await registeredUser(session.id);
 const result=await getPool().query(`SELECT ch.*, (m.user_id IS NOT NULL) AS joined,
 (SELECT COUNT(DISTINCT ad.activity_date)::int FROM activity_days ad WHERE ad.user_id=$1 AND ad.competition_id=ch.competition_id AND ad.activity_date BETWEEN ch.start_date AND ch.end_date) AS days
 FROM coin_challenges ch LEFT JOIN coin_challenge_members m ON m.challenge_id=ch.id AND m.user_id=$1
 WHERE ch.active=true ORDER BY ch.end_date`,[user.id]);
 return NextResponse.json({challenges:result.rows});}catch(e){return jsonError(e,"coins.challenges.get");}
}
export async function POST(request:Request){
 try{const session=await requireSession();const user=await registeredUser(session.id);
 const parsed=z.object({challengeId:z.number().int().positive(),action:z.enum(["join","claim"])}).safeParse(await request.json());
 if(!parsed.success)throw new ApiError(400,"Некорректный запрос","INVALID_CHALLENGE");
 const result=await coinTransaction(async c=>{
  const r=await c.query("SELECT * FROM coin_challenges WHERE id=$1 AND active=true FOR UPDATE",[parsed.data.challengeId]);
  if(!r.rowCount)throw new ApiError(404,"Задание не найдено","NOT_FOUND");
  const ch=r.rows[0];const today=(await c.query("SELECT (now() AT TIME ZONE 'Europe/Moscow')::date AS today")).rows[0].today;
  if(parsed.data.action==="join"){
   if(new Date(today)>new Date(ch.end_date))throw new ApiError(409,"Задание завершено","CHALLENGE_ENDED");
   await c.query("INSERT INTO coin_challenge_members(challenge_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[ch.id,user.id]);
   return {joined:true};
  }
  const member=await c.query("SELECT 1 FROM coin_challenge_members WHERE challenge_id=$1 AND user_id=$2",[ch.id,user.id]);
  if(!member.rowCount)throw new ApiError(409,"Сначала вступите в задание","NOT_JOINED");
  if(new Date(today)<=new Date(ch.end_date))throw new ApiError(409,"Награда доступна после окончания задания","NOT_FINISHED");
  const days=await c.query("SELECT COUNT(DISTINCT activity_date)::int AS days FROM activity_days WHERE competition_id=$1 AND user_id=$2 AND activity_date BETWEEN $3 AND $4",[ch.competition_id,user.id,ch.start_date,ch.end_date]);
  if(days.rows[0].days<ch.required_days)throw new ApiError(409,"Условие задания не выполнено","NOT_ELIGIBLE");
  const awarded=await changeCoins(c,user.id,ch.reward,"challenge","challenge:"+ch.id+":"+user.id);
  return {awarded,amount:awarded?ch.reward:0};
 });
 return NextResponse.json(result);
 }catch(e){return jsonError(e,"coins.challenges.post");}
}