import type { PoolClient } from "pg";
import { getPool } from "@/db/client";
import { ApiError } from "@/lib/api";

export async function coinTransaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T> {
 const client=await getPool().connect();
 try { await client.query("BEGIN"); const result=await fn(client); await client.query("COMMIT"); return result; }
 catch(e){ await client.query("ROLLBACK"); throw e; }
 finally { client.release(); }
}
export async function ensureWallet(c:PoolClient,userId:number){
 await c.query("INSERT INTO coin_wallets(user_id) VALUES($1) ON CONFLICT DO NOTHING",[userId]);
}
export async function changeCoins(c:PoolClient,userId:number,amount:number,kind:string,reference:string,counterparty?:number){
 if(!Number.isSafeInteger(amount)||amount===0)throw new ApiError(400,"Некорректная сумма","INVALID_AMOUNT");
 await ensureWallet(c,userId);
 const existing=await c.query("SELECT id FROM coin_ledger WHERE user_id=$1 AND reference=$2",[userId,reference]);
 if(existing.rowCount)return false;
 const changed=await c.query(`UPDATE coin_wallets SET balance=balance+$2,
 earned_total=earned_total+CASE WHEN $2>0 THEN $2 ELSE 0 END,
 spent_total=spent_total+CASE WHEN $2<0 THEN -$2 ELSE 0 END,
 updated_at=now() WHERE user_id=$1 AND balance+$2>=0 RETURNING balance`,[userId,amount]);
 if(!changed.rowCount)throw new ApiError(409,"Недостаточно G-Coins","INSUFFICIENT_COINS");
 await c.query("INSERT INTO coin_ledger(user_id,amount,kind,reference,counterparty_user_id) VALUES($1,$2,$3,$4,$5)",[userId,amount,kind,reference,counterparty??null]);
 return true;
}
export async function grantDailyCoins(userId:number,competitionId:number,day:string,streak:number){
 await coinTransaction(async c=>{
  await changeCoins(c,userId,10,"daily",`daily:${competitionId}:${day}`);
  for(const [threshold,reward] of [[3,15],[7,40],[14,80],[21,120],[30,200]]){
   if(streak>=threshold)await changeCoins(c,userId,reward,"streak",`streak:${competitionId}:${threshold}`);
  }
 });
}
export async function walletData(userId:number){
 return coinTransaction(async c=>{
  await ensureWallet(c,userId);
  const wallet=await c.query("SELECT balance,earned_total,spent_total,xp FROM coin_wallets WHERE user_id=$1",[userId]);
  const ledger=await c.query("SELECT id,amount,kind,reference,created_at FROM coin_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 40",[userId]);
  return {wallet:wallet.rows[0],transactions:ledger.rows};
 });
}
