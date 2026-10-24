"use client";
import {useCallback,useEffect,useState} from "react";
type Wallet={balance:number;earned_total:number;spent_total:number;xp:number};
type Transaction={id:number;kind:string;amount:number;created_at:string};
type Product={id:number;title:string;description:string;kind:string;price:number;stock:number|null};
type Challenge={id:number;title:string;description:string;days:number;required_days:number;reward:number;joined:boolean};
type Fund={id:number;title:string;goal:number;balance:number};
type Participant={id:number;name:string};
type Section="wallet"|"earn"|"shop"|"history";
type Sheet="transfer"|"fund"|null;
async function request<T>(path:string,body?:object):Promise<T>{
 const response=await fetch(path,{credentials:"same-origin",headers:body?{"Content-Type":"application/json"}:undefined,method:body?"POST":"GET",body:body?JSON.stringify(body):undefined});
 const data=await response.json();
 if(!response.ok)throw new Error(data.error||"Не удалось выполнить операцию");
 return data;
}
const labels:Record<string,string>={daily:"Активный день",streak:"Бонус за серию",transfer_in:"Получено от участника",transfer_out:"Перевод участнику",purchase:"Покупка награды",refund:"Возврат монет",challenge:"Награда за челлендж",team_fund:"Взнос в копилку"};
const format=(n:number)=>new Intl.NumberFormat("ru-RU").format(n);
export default function CoinsPanel(){
 const [section,setSection]=useState<Section>("wallet");
 const [sheet,setSheet]=useState<Sheet>(null);
 const [wallet,setWallet]=useState<Wallet|null>(null);
 const [transactions,setTransactions]=useState<Transaction[]>([]);
 const [products,setProducts]=useState<Product[]>([]);
 const [challenges,setChallenges]=useState<Challenge[]>([]);
 const [funds,setFunds]=useState<Fund[]>([]);
 const [participants,setParticipants]=useState<Participant[]>([]);
 const [recipient,setRecipient]=useState("");
 const [amount,setAmount]=useState("50");
 const [fundId,setFundId]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const refresh=useCallback(async()=>{
  const [w,p,c,f]=await Promise.all([
   request<{wallet:Wallet;transactions:Transaction[]}>("/api/coins"),
   request<{products:Product[]}>("/api/coins/shop"),
   request<{challenges:Challenge[]}>("/api/coins/challenges"),
   request<{funds:Fund[]}>("/api/coins/teams")
  ]);
  setWallet(w.wallet);setTransactions(w.transactions);setProducts(p.products);setChallenges(c.challenges);setFunds(f.funds);
 },[]);
 useEffect(()=>{void refresh().catch(e=>setError(e instanceof Error?e.message:String(e)));
  void request<{participants:Participant[]}>("/api/coins/participants").then(r=>setParticipants(r.participants)).catch(()=>{});
 },[refresh]);
 async function action(path:string,body:object,success="Готово"){
  setBusy(true);setError("");setNotice("");
  try{await request(path,body);await refresh();setSheet(null);setNotice(success);}
  catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{setBusy(false);}
 }
 const open=(name:Sheet)=>{setError("");setNotice("");setSheet(name);};
 const tab=(name:Section)=>{setSection(name);setError("");setNotice("");setSheet(null);};
 return <section className="gosup-wallet" aria-label="Кошелёк GOSUP Coins">
  <div className="gw-header"><div className="gw-logo">G</div><div><strong>GOSUP <span>COINS</span></strong><small>Твоя игровая экономика</small></div><div className="gw-level">★ {wallet?.xp??0} XP</div></div>
  {section==="wallet"&&<>
   <div className="gw-balance"><div className="gw-kicker">Общий баланс</div><div className="gw-balance-value">{wallet?format(wallet.balance):"—"}<span> G</span></div><div className="gw-balance-sub">Монеты сохраняются между конкурсами</div></div>
   <div className="gw-stats"><div><span>↗</span><small>Заработано</small><strong>{format(wallet?.earned_total??0)} G</strong></div><div><span>↘</span><small>Потрачено</small><strong>{format(wallet?.spent_total??0)} G</strong></div></div>
   <div className="gw-actions">
    <button onClick={()=>open("transfer")}><span>➤</span>Перевести</button>
    <button onClick={()=>tab("earn")}><span>＋</span>Заработать</button>
    <button onClick={()=>tab("shop")}><span>♢</span>Награды</button>
    <button onClick={()=>tab("history")}><span>↔</span>История</button>
   </div>
   <button className="gw-banner" onClick={()=>tab("earn")}><span><b>Двигайся. Зарабатывай.</b><small>Получай G-Coins за каждый активный день →</small></span><span className="gw-banner-art">⚡</span></button>
   <div className="gw-section-heading"><h3>Мои возможности</h3><span>GOSUP Games</span></div>
   <button className="gw-asset" onClick={()=>tab("shop")}><span className="gw-asset-icon">🎁</span><span><b>Магазин наград</b><small>Виртуальные и реальные призы</small></span><strong>›</strong></button>
   <button className="gw-asset" onClick={()=>tab("earn")}><span className="gw-asset-icon green">🏃</span><span><b>Задания и челленджи</b><small>Дополнительные монеты за активность</small></span><strong>›</strong></button>
   <button className="gw-asset" onClick={()=>open("fund")}><span className="gw-asset-icon blue">👥</span><span><b>Командные копилки</b><small>Объединяйтесь ради общей цели</small></span><strong>›</strong></button>
   <div className="gw-section-heading"><h3>Последние операции</h3><button onClick={()=>tab("history")}>Все →</button></div>
   {transactions.length?transactions.slice(0,3).map(t=><div className="gw-transaction" key={t.id}><span className="gw-transaction-icon">{t.amount>0?"↙":"↗"}</span><span><b>{labels[t.kind]??"Операция"}</b><small>{new Date(t.created_at).toLocaleDateString("ru-RU")}</small></span><strong className={t.amount>0?"positive":""}>{t.amount>0?"+":""}{format(t.amount)} G</strong></div>):<p className="gw-empty">Здесь появятся первые начисления и переводы.</p>}
  </>}
  {section==="earn"&&<div className="gw-content"><div className="gw-section-heading"><h3>Зарабатывай G-Coins</h3></div><div className="gw-info"><span>⚡</span><div><b>+10 G за активный день</b><small>Серии активности открывают дополнительные бонусы. Монеты не зависят от выбора конкурса в кошельке.</small></div></div><div className="gw-section-heading"><h3>Челленджи</h3></div>
   {challenges.length?challenges.map(c=><article className="gw-item" key={c.id}><div className="gw-item-top"><span className="gw-item-icon">🏅</span><div><b>{c.title}</b><small>{c.description||"Двигайся и получай бонусы"}</small></div><strong>+{c.reward} G</strong></div><div className="gw-progress"><i style={{width:`${Math.min(100,Math.round(c.days/c.required_days*100))}%`}}/></div><div className="gw-item-footer"><small>{c.days} из {c.required_days} дней</small><button disabled={busy} onClick={()=>void action("/api/coins/challenges",{challengeId:c.id,action:c.joined?"claim":"join"},c.joined?"Награда обработана":"Вы участвуете")}>{c.joined?"Забрать награду":"Участвовать"}</button></div></article>):<p className="gw-empty">Новые задания скоро появятся.</p>}
  </div>}
  {section==="shop"&&<div className="gw-content"><div className="gw-section-heading"><h3>Магазин наград</h3><span>{format(wallet?.balance??0)} G</span></div><p className="gw-hint">Обменивай заработанные монеты на игровые улучшения и призы.</p>
   {products.length?products.map(p=><article className="gw-item" key={p.id}><div className="gw-item-top"><span className="gw-item-icon">{p.kind==="real"?"🎁":"✨"}</span><div><b>{p.title}</b><small>{p.description}</small><small>{p.kind==="real"?"Реальный приз":"Виртуальная награда"}{p.stock!==null?` · осталось ${p.stock}`:""}</small></div></div><div className="gw-item-footer"><strong>{format(p.price)} G</strong><button disabled={busy||!!(p.stock!==null&&p.stock<=0)||(wallet!==null&&wallet.balance<p.price)} onClick={()=>{if(window.confirm(`Купить «${p.title}» за ${p.price} G?`))void action("/api/coins/shop",{productId:p.id},"Награда заказана");}}>Получить</button></div></article>):<p className="gw-empty">Магазин пока пуст.</p>}
  </div>}
  {section==="history"&&<div className="gw-content"><div className="gw-section-heading"><h3>История операций</h3></div>{transactions.length?transactions.map(t=><div className="gw-transaction" key={t.id}><span className="gw-transaction-icon">{t.amount>0?"↙":"↗"}</span><span><b>{labels[t.kind]??"Операция"}</b><small>{new Date(t.created_at).toLocaleString("ru-RU")}</small></span><strong className={t.amount>0?"positive":""}>{t.amount>0?"+":""}{format(t.amount)} G</strong></div>):<p className="gw-empty">Операций пока нет.</p>}</div>}
  {notice&&<p className="gw-notice" role="status">{notice}</p>}
  {error&&!sheet&&<p className="gw-error" role="alert">{error}</p>}
  <nav className="gw-nav" aria-label="Навигация кошелька">
   {([["wallet","◈","Кошелёк"],["earn","↗","Заработать"],["shop","♢","Награды"],["history","◷","История"]] as const).map(([id,icon,label])=><button key={id} className={section===id?"active":""} onClick={()=>tab(id)}><span>{icon}</span>{label}</button>)}
  </nav>
  {sheet&&<div className="gw-overlay" onClick={()=>setSheet(null)}><div className="gw-sheet" onClick={e=>e.stopPropagation()}>
   <div className="gw-sheet-head"><h3>{sheet==="transfer"?"Перевести G-Coins":"Командная копилка"}</h3><button aria-label="Закрыть" onClick={()=>setSheet(null)}>×</button></div>
   {sheet==="transfer"?<><p>Доступно: {format(wallet?.balance??0)} G · лимит 100 G за 24 часа</p><label>Получатель<select value={recipient} onChange={e=>setRecipient(e.target.value)}><option value="">Выберите участника</option>{participants.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Сумма, G<input inputMode="numeric" type="number" min="10" max="100" value={amount} onChange={e=>setAmount(e.target.value)}/></label><button className="gw-confirm" disabled={busy||!recipient||!Number.isInteger(Number(amount))||Number(amount)<10||Number(amount)>100||(wallet!==null&&Number(amount)>wallet.balance)} onClick={()=>void action("/api/coins/transfers",{recipientId:Number(recipient),amount:Number(amount)},"Перевод выполнен")}>Перевести {amount||0} G</button></>:<><p>Внеси монеты в общую цель команды.</p><label>Копилка<select value={fundId} onChange={e=>setFundId(e.target.value)}><option value="">Выберите копилку</option>{funds.map(f=><option key={f.id} value={f.id}>{f.title} · {f.balance}/{f.goal} G</option>)}</select></label><button className="gw-confirm" disabled={busy||!fundId||(wallet!==null&&wallet.balance<10)} onClick={()=>void action("/api/coins/teams",{fundId:Number(fundId),amount:10},"Взнос 10 G внесён")}>Внести 10 G</button></>}
   {error&&<p className="gw-error" role="alert">{error}</p>}
  </div></div>}
 </section>;
}
