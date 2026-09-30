"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Wallet={coinBalance:number;diamondBalance:number;cashBalanceUsd:number;creatorRefundLiabilityUsd?:number};
type Ledger={type:string;coinsDelta:number;diamondsDelta:number;cashDeltaUsd:number;createdAt:string;referenceId?:string};
type Earnings={period:{days:number;from:string;to:string};summary:{giftsReceived:number;diamonds:number;grossCreatorEarningsUsd:number;cashCreditedUsd:number;liabilityOffsetUsd:number;currentCashBalanceUsd:number;creatorRefundLiabilityUsd:number};withdrawals:{count:number;paidUsd:number;pendingUsd:number;failedUsd:number;recent:Array<{amountUsd:number;status:string;provider?:string;createdAt:string}>};gifts:Array<{transactionId:string;giftName:string;quantity:number;coinsSpent:number;diamondsAwarded:number;creatorEarningsUsd:number;creatorCashCreditUsd:number;creatorLiabilityOffsetUsd:number;context:string;createdAt:string}>};

function usd(value:number){return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:2}).format(Number(value||0))}
function date(value:string){return new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(value))}

export default function CreatorWallet(){
  const api=process.env.NEXT_PUBLIC_TWITOK_API_URL??"http://localhost:4000/api/v1";
  const [wallet,setWallet]=useState<Wallet|null>(null);
  const [ledger,setLedger]=useState<Ledger[]>([]);
  const [earnings,setEarnings]=useState<Earnings|null>(null);
  const [days,setDays]=useState(30);
  const [message,setMessage]=useState("");
  const token=typeof window!=="undefined"?window.localStorage.getItem("twitok_user_token"):"";

  useEffect(()=>{ if(!token)return;
    Promise.all([
      fetch(api+"/wallet/me",{headers:{Authorization:"Bearer "+token},cache:"no-store"}),
      fetch(api+"/wallet/me/ledger?limit=20",{headers:{Authorization:"Bearer "+token},cache:"no-store"}),
      fetch(api+"/wallet/me/earnings?days="+days,{headers:{Authorization:"Bearer "+token},cache:"no-store"})
    ]).then(async([w,l,e])=>{
      if(w.ok)setWallet(await w.json());
      if(l.ok){const d=await l.json();setLedger(d.transactions??[])}
      if(e.ok)setEarnings(await e.json());
    }).catch(()=>setMessage("Unable to load creator wallet right now."));
  },[api,token,days]);

  const summary=earnings?.summary;
  const maxGift=Math.max(1,...(earnings?.gifts??[]).map(g=>Number(g.creatorEarningsUsd??0)));
  const topGifts=useMemo(()=>earnings?.gifts.slice(0,10)??[],[earnings]);

  const requestWithdrawal=()=>setMessage(summary?.creatorRefundLiabilityUsd&&summary.creatorRefundLiabilityUsd>0.00000001?"Your creator refund liability must be cleared before withdrawal.":"Withdrawals are available from $10 after verified payout details are added.");

  return <main className="studio">
    <header className="studio-top">
      <div><Link href="/creator/studio" className="back">← Creator Studio</Link><h1>Creator Wallet</h1><p>Track earnings, Gifts, Diamonds, refunds and withdrawals.</p></div>
      <div className="range-tabs">{[7,30,90].map(n=><button key={n} className={days===n?"range active":"range"} onClick={()=>setDays(n)}>{n}D</button>)}</div>
    </header>

    <section className="metrics">
      <article><span>AVAILABLE</span><strong>{usd(wallet?.cashBalanceUsd??0)}</strong><small>Ready for withdrawal</small></article>
      <article><span>GROSS EARNINGS</span><strong>{usd(summary?.grossCreatorEarningsUsd??0)}</strong><small>{summary?.period?.days??days}-day period</small></article>
      <article><span>DIAMONDS</span><strong>{(summary?.diamonds??wallet?.diamondBalance??0).toLocaleString()}</strong><small>Creator rewards received</small></article>
      <article><span>GIFTS</span><strong>{(summary?.giftsReceived??0).toLocaleString()}</strong><small>Gift transactions</small></article>
    </section>

    <section className="earnings-cards">
      <article className="studio-panel"><span>CREATOR SETTLEMENT</span><h2>{usd(summary?.cashCreditedUsd??0)}</h2><p>Cash credited after refund-liability offsets.</p></article>
      <article className="studio-panel"><span>LIABILITY OFFSET</span><h2>{usd(summary?.liabilityOffsetUsd??0)}</h2><p>Future Gift earnings used to settle prior refunds.</p></article>
      <article className="studio-panel"><span>REFUND LIABILITY</span><h2>{usd(summary?.creatorRefundLiabilityUsd??0)}</h2><p>{(summary?.creatorRefundLiabilityUsd??0)>0?"Must be cleared before withdrawal.":"No outstanding creator refund liability."}</p></article>
    </section>

    <section className="studio-grid">
      <article className="studio-panel wide">
        <div className="section-head"><div><span>GIFT PERFORMANCE</span><h2>Recent creator earnings</h2></div><small>Gross creator allocation</small></div>
        {topGifts.length?<div className="earning-list">{topGifts.map(g=><div className="earning-row" key={g.transactionId}>
          <div className="earning-icon">🎁</div>
          <div className="earning-main"><strong>{g.giftName} × {g.quantity}</strong><small>{g.context} · {date(g.createdAt)}</small><div className="earning-track"><i style={{width:`${Math.max(3,Math.round((Number(g.creatorEarningsUsd||0)/maxGift)*100))}%`}}/></div></div>
          <strong>{usd(g.creatorEarningsUsd)}</strong>
        </div>)}</div>:<p>No Gifts received in this period.</p>}
      </article>

      <article className="studio-panel">
        <span>WITHDRAWALS</span><h2>Payout activity</h2>
        <div className="wallet-lines"><div><span>Paid</span><strong>{usd(earnings?.withdrawals.paidUsd??0)}</strong></div><div><span>Pending</span><strong>{usd(earnings?.withdrawals.pendingUsd??0)}</strong></div><div><span>Failed/reversed</span><strong>{usd(earnings?.withdrawals.failedUsd??0)}</strong></div></div>
        <button className="primary" onClick={requestWithdrawal}>Request withdrawal</button>
        {message&&<p className="playlist-message">{message}</p>}
      </article>

      <article className="studio-panel wide">
        <span>TRANSACTIONS</span><h2>Wallet activity</h2>
        {ledger.length?<div className="playlist-list">{ledger.map((x,i)=><div className="playlist-card" key={x.referenceId??String(i)}><strong>{x.type.replaceAll("_"," ")}</strong><span>{x.coinsDelta>0?"+":""}{x.coinsDelta} Coins · {x.diamondsDelta>0?"+":""}{x.diamondsDelta} Diamonds · $ {x.cashDeltaUsd.toFixed(4)}</span></div>)}</div>:<p>No wallet transactions yet.</p>}
      </article>
    </section>
  </main>;
}
