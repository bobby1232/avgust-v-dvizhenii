import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession,jsonError,ApiError } from "@/lib/api";
import { registeredUser } from "@/lib/data";
import { coinTransaction,changeCoins,ensureWallet } from "@/lib/coins";
const schema=z.object({recipientId:z.number().int().positive(),amount:z.number().int().min(10).max(100),note:z.string().trim().max(140).optional().default("")});
export async function POST(request:Request){
 try{
  const session=await requireSession(); const sender=await registeredUser(session.id);
  const parsed=schema.safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,"Некорректный перевод","INVALID_TRANSFER");
  const {recipientId,amount,note}=parsed.data;
  if(sender.id===recipientId)throw new ApiError(400,"Нельзя переводить самому себе","SELF_TRANSFER");
  if(!sender.isActive)throw new ApiError(403,"Профиль отключён","DISABLED");
  const result=await coinTransaction(async c=>{
   await c.query("SELECT pg_advisory_xact_lock($1)",[sender.id]);
   const recipient=await c.query("SELECT id FROM users WHERE id=$1 AND is_active=true",[recipientId]);
   if(!recipient.rowCount)throw new ApiError(404,"Получатель не найден","RECIPIENT_NOT_FOUND");
   const limits=await c.query(`SELECT COALESCE(SUM(amount) FILTER(WHERE created_at>=now()-interval '24 hours'),0)::int AS daily,
    COALESCE(SUM(amount) FILTER(WHERE created_at>=date_trunc('month',now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'),0)::int AS monthly
    FROM coin_transfers WHERE sender_id=$1`,[sender.id]);
   if(limits.rows[0].daily+amount>100||limits.rows[0].monthly+amount>500)throw new ApiError(409,"Лимит переводов исчерпан","TRANSFER_LIMIT");
   await ensureWallet(c,recipientId);
   const inserted=await c.query("INSERT INTO coin_transfers(sender_id,recipient_id,amount,note) VALUES($1,$2,$3,$4) RETURNING id",[sender.id,recipientId,amount,note]);
   const ref="transfer:"+inserted.rows[0].id;
   await changeCoins(c,sender.id,-amount,"transfer_out",ref+":out",recipientId);
   await changeCoins(c,recipientId,amount,"transfer_in",ref+":in",sender.id);
   return {id:inserted.rows[0].id,amount};
  });
  return NextResponse.json(result,{status:201});
 }catch(e){return jsonError(e,"coins.transfer");}
}