import assert from "node:assert/strict"; import test from "node:test"; import { createHmac } from "node:crypto";
process.env.TELEGRAM_BOT_TOKEN="test-token"; process.env.NODE_ENV="test";
const { validateTelegramInitData, isAdminTelegramId }=await import("../lib/telegram.ts");
function signed(user, authDate=Math.floor(Date.now()/1000)){const params=new URLSearchParams({auth_date:String(authDate),user:JSON.stringify(user),query_id:"test"});const check=[...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");const secret=createHmac("sha256","WebAppData").update("test-token").digest();params.set("hash",createHmac("sha256",secret).update(check).digest("hex"));return params.toString()}
test("accepts valid Telegram initData and preserves a large ID",()=>assert.equal(validateTelegramInitData(signed({id:"90071992547409930",first_name:"Иван"})).id,"90071992547409930"));
test("rejects invalid Telegram initData",()=>assert.throws(()=>validateTelegramInitData("auth_date=1&hash=bad"),/Invalid Telegram signature/));
test("admin role comes only from environment",()=>{process.env.ADMIN_TELEGRAM_IDS="1, 90071992547409930";assert.equal(isAdminTelegramId("90071992547409930"),true);assert.equal(isAdminTelegramId("2"),false)});
test("migration contains reset-critical constraints and all tables",async()=>{const sql=await (await import("node:fs/promises")).readFile("drizzle/0000_postgresql.sql","utf8");for(const name of ["competitions","users","activities","audit_logs","activities_user_day_idx","competitions_one_active_idx"])assert.match(sql,new RegExp(name))});
