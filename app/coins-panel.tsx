"use client";
import { useEffect,useState } from "react";
type Wallet={balance:number;earned_total:number;spent_total:number;xp:number};
type Product={id:number;title:string;description:string;kind:string;price:number;stock:number|null};
type Challenge={id:number;title:string;description:string;days:number;required_days:number;reward:number;joined:boolean};
type Fund={id:number;title:string;goal:number;balance:number};
async function request<T>(path:string,body?:object):Promise<T>{
 const response=await fetch(path,{credentials:"same-origin",headers:body?{"Content-Type":"application/json"}:undefined,method:body?"POST":"GET",body:body?JSON.stringify(body):undefined});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||"Ошибка операции");
 return data;
}
export default function CoinsPanel(){
 const [wallet,setWallet]=useState<Wallet|null>(null);
 const [transactions,setTransactions]=useState<Array<{id:number;kind:string;amount:number}>>([]);
 const [products,setProducts]=useState<Product[]>([]);
 const [challenges,setChallenges]=useState<Challenge[]>([]);
 const [funds,setFunds]=useState<Fund[]>([]);
 const [recipient,setRecipient]=useState("");
 const [amount,setAmount]=useState("50");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 async function refresh(){
  const [w,p,c,f]=await Promise.all([
   request<{wallet:Wallet;transactions:Array<{id:number;kind:string;amount:number}>}>("/api/coins"),
   request<{products:Product[]}>("/api/coins/shop"),
   request<{challenges:Challenge[]}>("/api/coins/challenges"),
   request<{funds:Fund[]}>("/api/coins/teams")]);
  setWallet(w.wallet);setTransactions(w.transactions);setProducts(p.products);setChallenges(c.challenges);setFunds(f.funds);
 }
 useEffect(()=>{void refresh().catch(e=>setError(String(e)));},[]);
 async function action(path:string,body:object){
  setBusy(true);setError("");
  try{await request(path,body);await refresh();}
  catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 return <section className="section"><h3>🪙 GOSUP Coins</h3><div className="settings-list">
  <div style={{padding:16,background:"#e4f4e8",borderRadius:12,color:"#174a2a"}}>
   <small>Мой кошелёк</small><h2>{wallet?.balance??"—"} G</h2>
   <small>Заработано: {wallet?.earned_total??0} G · Потрачено: {wallet?.spent_total??0} G</small>
  </div>
  {error&&<p role="alert">{error}</p>}
  <h4>Переводы</h4>
  <label>ID получателя<input inputMode="numeric" value={recipient} onChange={e=>setRecipient(e.target.value)} placeholder="ID участника"/></label>
  <label>Сумма, G<input inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
  <button disabled={busy||!Number.isSafeInteger(Number(recipient))||Number(recipient)<=0} onClick={()=>void action("/api/coins/transfers",{recipientId:Number(recipient),amount:Number(amount)})}>Перевести монеты</button>
  <h4>Магазин</h4>
  {products.map(p=><div key={p.id} style={{padding:10,border:"1px solid #ddd",borderRadius:10}}>
   <b>{p.title}</b><small>{p.description} · {p.kind==="real"?"Реальный приз":"Виртуальная награда"}</small>
   <button disabled={busy||(p.stock!==null&&p.stock<=0)} onClick={()=>{if(window.confirm("Купить за "+p.price+" G?"))void action("/api/coins/shop",{productId:p.id});}}>Купить за {p.price} G</button>
  </div>)}
  <h4>Челленджи</h4>
  {challenges.map(c=><div key={c.id} style={{padding:10,border:"1px solid #ddd",borderRadius:10}}>
   <b>{c.title}</b><small>{c.days}/{c.required_days} дней · награда {c.reward} G</small>
   <button disabled={busy} onClick={()=>void action("/api/coins/challenges",{challengeId:c.id,action:c.joined?"claim":"join"})}>{c.joined?"Забрать награду":"Участвовать"}</button>
  </div>)}
  <h4>Командные копилки</h4>
  {funds.map(f=><div key={f.id} style={{padding:10,border:"1px solid #ddd",borderRadius:10}}>
   <b>{f.title}</b><small>{f.balance}/{f.goal} G</small>
   <button disabled={busy} onClick={()=>void action("/api/coins/teams",{fundId:f.id,amount:10})}>Внести 10 G</button>
  </div>)}
  <h4>История операций</h4>
  {transactions.map(t=><div key={t.id} style={{display:"flex",justifyContent:"space-between",padding:5}}><small>{t.kind}</small><b>{t.amount>0?"+":""}{t.amount} G</b></div>)}
 </div></section>;
}
