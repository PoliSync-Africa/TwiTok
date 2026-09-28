"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Wallet={coinBalance:number;diamondBalance:number;cashBalanceUsd:number};
type Ledger={type:string;coinsDelta:number;diamondsDelta:number;cashDeltaUsd:number;createdAt:string;referenceId?:string};

export default function CreatorWallet(){
  const api=process.env.NEXT_PUBLIC_TWITOK_API_URL??"http://localhost:4000/api/v1";
  const [wallet,setWallet]=useState<Wallet|null>(null);
  const [ledger,setLedger]=useState<Ledger[]>([]);
  const [message,setMessage]=useState("");
  const token=typeof window!=="undefined"?window.localStorage.getItem("twitok_user_token"):"";

  useEffect(()=>{ if(!token)return;
    Promise.all([
      fetch(api+"/wallet/me",{headers:{Authorization:"Bearer "+token},cache:"no-store"}),
      fetch(api+"/wallet/me/ledger?limit=20",{headers:{Authorization:"Bearer "+token},cache:"no-store"})
    ]).then(async([w,l])=>{
      if(w.ok)setWallet(await w.json());
      if(l.ok){const d=await l.json();setLedger(d.transactions??[])}
    }).catch(()=>setMessage("Unable to load wallet right now."));
  },[api,token]);

  const requestWithdrawal=()=>setMessage("Withdrawals are available from $10. Add your verified Ghana bank or mobile-money payout details before requesting a payout.");

  return <main className="studio">
    <header className="studio-top">
      <div><Link href="/creator/studio" className="back">← Creator Studio</Link><h1>Creator Wallet</h1><p>Track Coins, Diamonds, creator earnings and payout activity.</p></div>
    </header>
    <section className="metrics">
      <article><span>COINS</span><strong>{wallet?.coinBalance??0}</strong><small>Spendable balance</small></article>
      <article><span>DIAMONDS</span><strong>{wallet?.diamondBalance??0}</strong><small>Creator rewards</small></article>
      <article><span>AVAILABLE</span><strong>$ {(wallet?.cashBalanceUsd??0).toFixed(2)}</strong><small>Available for withdrawal</small></article>
      <article><span>MINIMUM</span><strong>$10</strong><small>Minimum withdrawal</small></article>
    </section>
    <section className="studio-grid">
      <article className="studio-panel wide"><span>PAYOUTS</span><h2>Bank & Mobile Money</h2><p>Ghana creator payouts support bank accounts and mobile-money destinations. Payout requests are processed only after wallet balance and payout details are verified.</p><button className="primary" onClick={requestWithdrawal}>Request withdrawal</button>{message&&<p className="playlist-message">{message}</p>}</article>
      <article className="studio-panel wide"><span>TRANSACTIONS</span><h2>Wallet activity</h2>{ledger.length?<div className="playlist-list">{ledger.map((x,i)=><div className="playlist-card" key={x.referenceId??String(i)}><strong>{x.type.replaceAll("_"," ")}</strong><span>{x.coinsDelta>0?"+":""}{x.coinsDelta} Coins · {x.diamondsDelta>0?"+":""}{x.diamondsDelta} Diamonds · $ {x.cashDeltaUsd.toFixed(4)}</span></div>)}</div>:<p>No wallet transactions yet.</p>}</article>
    </section>
  </main>;
}
