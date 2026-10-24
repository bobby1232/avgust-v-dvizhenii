import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/db/client";
import { coinTransaction,changeCoins } from "@/lib/coins";
import { requireSession,jsonError,ApiError } from "@/lib/api";
import { registeredUser } from "@/lib/data";
export async function GET(){
 try {await requireSession();const result=await getPool().query("SELECT id,title,description,kind,price,stock FROM coin_products WHERE active=true ORDER BY price");return NextResponse.json({products:result.rows});}
 catch(e){return jsonError(e,"coins.shop.get");}
}
export async function POST(request:Request){
 try{
  const session=await requireSession();const user=await registeredUser(session.id);
  if(!user.isActive)throw new ApiError(403,"Профиль отключён","DISABLED");
  const parsed=z.object({productId:z.number().int().positive()}).safeParse(await request.json());
  if(!parsed.success)throw new ApiError(400,"Некорректный товар","INVALID_PRODUCT");
  const order=await coinTransaction(async c=>{
   const p=await c.query("SELECT * FROM coin_products WHERE id=$1 AND active=true FOR UPDATE",[parsed.data.productId]);
   if(!p.rowCount)throw new ApiError(404,"Товар недоступен","PRODUCT_NOT_FOUND");
   const product=p.rows[0];
   if(product.stock!==null&&product.stock<=0)throw new ApiError(409,"Награда закончилась","OUT_OF_STOCK");
   if(product.min_earned_percent>0){
    const earned=await c.query("SELECT COALESCE(SUM(amount),0)::int AS earned FROM coin_ledger WHERE user_id=$1 AND amount>0 AND kind NOT IN ('transfer_in','refund')",[user.id]);
    if(earned.rows[0].earned*100<product.price*product.min_earned_percent)throw new ApiError(409,"Недостаточно лично заработанных монет","PERSONAL_EARNINGS_REQUIRED");
   }
   const r=await c.query("INSERT INTO coin_orders(user_id,product_id,price) VALUES($1,$2,$3) RETURNING id,status",[user.id,product.id,product.price]);
   await changeCoins(c,user.id,-product.price,"purchase","order:"+r.rows[0].id);
   if(product.stock!==null)await c.query("UPDATE coin_products SET stock=stock-1 WHERE id=$1",[product.id]);
   return r.rows[0];
  });
  return NextResponse.json({order},{status:201});
 }catch(e){return jsonError(e,"coins.shop.post");}
}