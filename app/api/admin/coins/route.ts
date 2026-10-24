import { NextResponse } from "next/server";
import { z } from "zod";
import { getPool } from "@/db/client";
import { coinTransaction,changeCoins } from "@/lib/coins";
import { requireAdmin,jsonError,ApiError } from "@/lib/api";
export async function GET(){
 try{await requireAdmin();
 const [summary,orders]=await Promise.all([
 getPool().query("SELECT COUNT(*)::int AS wallets,COALESCE(SUM(balance),0)::int AS circulation,COALESCE(SUM(earned_total),0)::int AS minted,COALESCE(SUM(spent_total),0)::int AS spent FROM coin_wallets"),
 getPool().query("SELECT o.id,o.user_id,o.price,o.status,p.title FROM coin_orders o JOIN coin_products p ON p.id=o.product_id ORDER BY o.id DESC LIMIT 100")]);
 return NextResponse.json({summary:summary.rows[0],orders:orders.rows});
 }catch(e){return jsonError(e,"admin.coins.get");}
}
export async function POST(request:Request){
 try{await requireAdmin();
 const parsed=z.discriminatedUnion("action",[
 z.object({action:z.literal("product"),title:z.string().trim().min(1).max(160),description:z.string().max(500).default(""),kind:z.enum(["virtual","real"]),price:z.number().int().positive(),stock:z.number().int().min(0).nullable(),minEarnedPercent:z.number().int().min(0).max(100).default(0)}),
 z.object({action:z.literal("challenge"),title:z.string().trim().min(1).max(160),description:z.string().max(500).default(""),competitionId:z.number().int().positive(),startDate:z.iso.date(),endDate:z.iso.date(),requiredDays:z.number().int().positive(),reward:z.number().int().min(0).max(500)}),
 z.object({action:z.literal("fund"),title:z.string().trim().min(1).max(160),goal:z.number().int().positive()}),
 z.object({action:z.literal("fulfill"),orderId:z.number().int().positive()}),
 z.object({action:z.literal("cancel"),orderId:z.number().int().positive()}),
 ]).safeParse(await request.json());
 if(!parsed.success)throw new ApiError(400,"Некорректные параметры","INVALID_INPUT");
 const x=parsed.data;
 const result=await coinTransaction(async c=>{
  if(x.action==="product")return (await c.query("INSERT INTO coin_products(title,description,kind,price,stock,min_earned_percent) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",[x.title,x.description,x.kind,x.price,x.stock,x.minEarnedPercent])).rows[0];
  if(x.action==="challenge"){
   if(x.endDate<x.startDate)throw new ApiError(400,"Неверные даты","INVALID_DATES");
   return (await c.query("INSERT INTO coin_challenges(title,description,competition_id,start_date,end_date,required_days,reward) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",[x.title,x.description,x.competitionId,x.startDate,x.endDate,x.requiredDays,x.reward])).rows[0];
  }
  if(x.action==="fund")return (await c.query("INSERT INTO coin_team_funds(title,goal) VALUES($1,$2) RETURNING id",[x.title,x.goal])).rows[0];
  const order=await c.query("SELECT * FROM coin_orders WHERE id=$1 FOR UPDATE",[x.orderId]);
  if(!order.rowCount)throw new ApiError(404,"Заказ не найден","NOT_FOUND");
  const o=order.rows[0];
  if(o.status!=="pending")throw new ApiError(409,"Заказ уже обработан","ORDER_PROCESSED");
  if(x.action==="cancel"){
   await changeCoins(c,Number(o.user_id),o.price,"refund","refund:order:"+o.id);
   await c.query("UPDATE coin_products SET stock=stock+1 WHERE id=$1 AND stock IS NOT NULL",[o.product_id]);
  }
  await c.query("UPDATE coin_orders SET status=$2,updated_at=now() WHERE id=$1",[o.id,x.action==="cancel"?"cancelled":"fulfilled"]);
  return {id:o.id,status:x.action==="cancel"?"cancelled":"fulfilled"};
 });
 return NextResponse.json(result);
 }catch(e){return jsonError(e,"admin.coins.post");}
}