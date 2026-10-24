"use client";
import {useEffect,useState} from "react";
type Order={id:number;user_id:number;price:number;status:string;title:string};
export default function CoinsAdmin(){
 const [orders,setOrders]=useState<Order[]>([]);
 const [summary,setSummary]=useState<{wallets:number;circulation:number;minted:number;spent:number}|null>(null);
 const [title,setTitle]=useState("");
 const [price,setPrice]=useState("150");
 const [stock,setStock]=useState("10");
 const [kind,setKind]=useState<"virtual"|"real">("virtual");
 const [message,setMessage]=useState("");
 async function load(){const r=await fetch("/api/admin/coins");const d=await r.json();if(!r.ok)throw Error(d.error);setOrders(d.orders);setSummary(d.summary);}
 useEffect(()=>{void load().catch(e=>setMessage(String(e)));},[]);
 async function action(body:object){
  try{const r=await fetch("/api/admin/coins",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!r.ok)throw Error(d.error);setMessage("Сохранено");await load();}
  catch(e){setMessage(e instanceof Error?e.message:String(e));}
 }
 return <section className="section"><h3>Управление G-Coins</h3><div className="settings-list">
  {summary&&<p>Кошельков: {summary.wallets} · В обращении: {summary.circulation} G · Выпущено: {summary.minted} G · Списано: {summary.spent} G</p>}
  {message&&<p role="status">{message}</p>}
  <h4>Добавить награду</h4>
  <label>Название<input value={title} onChange={e=>setTitle(e.target.value)}/></label>
  <label>Цена, G<input inputMode="numeric" value={price} onChange={e=>setPrice(e.target.value)}/></label>
  <label>Остаток<input inputMode="numeric" value={stock} onChange={e=>setStock(e.target.value)}/></label>
  <select value={kind} onChange={e=>setKind(e.target.value as "virtual"|"real")}><option value="virtual">Виртуальная</option><option value="real">Реальная</option></select>
  <button onClick={()=>void action({action:"product",title,description:"",kind,price:Number(price),stock:stock===""?null:Number(stock),minEarnedPercent:kind==="real"?50:0})}>Добавить товар</button>
  <h4>Заявки на награды</h4>
  {orders.map(o=><div key={o.id} style={{padding:10,border:"1px solid #ddd",borderRadius:10}}>
   <b>#{o.id} · {o.title}</b><small>Участник #{o.user_id} · {o.price} G · {o.status}</small>
   {o.status==="pending"&&<><button onClick={()=>void action({action:"fulfill",orderId:o.id})}>Выдано</button><button onClick={()=>void action({action:"cancel",orderId:o.id})}>Отменить и вернуть G</button></>}
  </div>)}
 </div></section>;
}
