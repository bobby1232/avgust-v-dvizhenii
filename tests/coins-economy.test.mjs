import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";
test("coins migration and service are present",async()=>{
 const sql=await readFile("drizzle/0008_gosup_coins.sql","utf8");
 const service=await readFile("lib/coins.ts","utf8");
 assert.ok(sql.includes("coin_wallets"));
 assert.ok(sql.includes("coin_ledger"));
 assert.ok(sql.includes("coin_transfers"));
 assert.ok(sql.includes("coin_orders"));
 assert.ok(service.includes("coinTransaction"));
 assert.ok(service.includes("grantDailyCoins"));
});
