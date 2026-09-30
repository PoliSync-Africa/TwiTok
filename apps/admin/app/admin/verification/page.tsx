"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type RequestRow={requestId:string;userId:string;username:string|null;nickname:string|null;countryCode:string|null;accountType:string|null;type:string;legalName:string;displayName:string;website:string|null;supportingLinks:string[];reason:string;status:string;createdAt:string};

export default function VerificationAdminPage(){
  const api=process.env.NEXT_PUBLIC_TWITOK_API_URL??"http://localhost:4000/api/v1";
  const [rows,setRows]=useState<RequestRow[]>([]);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  useEffect(()=>{fetch(api+"/admin/verification/requests?status=PENDING",{credentials:"include"}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error??"Unable to load requests");setRows(d.requests??[])}).catch(e=>setError(e instanceof Error?e.message:"Unable to load requests"))},[api]);
  async function review(requestId:string,decision:"APPROVE"|"REJECT"){
    setBusy(requestId);setError("");
    const notes=window.prompt(decision==="APPROVE"?"Optional approval note":"Reason for rejection")??"";
    const r=await fetch("/api/admin/verification/review",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId,decision,reviewNotes:notes})});
    const d=await r.json().catch(()=>({}));if(!r.ok){setError(d.error??"Review failed");setBusy("");return}
    setRows(v=>v.filter(x=>x.requestId!==requestId));setBusy("");
  }
  return <main className="admin-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark">T</div><div><strong>TwiTok</strong><span>OWNER CONTROL</span></div></div><nav><Link href="/admin">Command Center</Link><Link className="active" href="/admin/verification">Verification</Link><Link href="/admin/money">Finance</Link><Link href="/admin/safety">Safety & Moderation</Link><Link href="/admin/security">Security & Audit</Link></nav><div className="sidebar-footer"><div className="admin-badge">OWNER • PRIVILEGED</div><small>Verification decisions are owner-only.</small></div></aside>
  <section className="content"><header className="topbar"><div><p className="eyebrow">TRUST & AUTHENTICITY</p><h1>Verification Review</h1><p className="muted">Review identity, account completeness and credible public evidence before granting a badge.</p></div></header>
  {error&&<div className="notice">{error}</div>}
  <section className="verification-admin-list">{rows.length===0?<div className="panel"><h2>No pending requests</h2><p className="muted">New applications will appear here.</p></div>:rows.map(row=><article className="panel verification-admin-card" key={row.requestId}><div className="panel-head"><div><p className="eyebrow">{row.type} · {row.countryCode??"—"}</p><h2>{row.displayName} @{row.username}</h2><p className="muted">{row.legalName} · Account type: {row.accountType??"—"}</p></div><span className="status-dot">PENDING</span></div><p>{row.reason||"No additional reason provided."}</p>{row.website&&<p><strong>Website:</strong> <a href={row.website} target="_blank" rel="noreferrer">{row.website}</a></p>}<div><strong>Supporting evidence</strong><ul>{row.supportingLinks.map(link=><li key={link}><a href={link} target="_blank" rel="noreferrer">{link}</a></li>)}</ul></div><p className="muted">Request ID: {row.requestId}</p><div className="finance-actions"><button className="logout" disabled={busy===row.requestId} onClick={()=>void review(row.requestId,"REJECT")}>Reject</button><button className="primary" disabled={busy===row.requestId} onClick={()=>void review(row.requestId,"APPROVE")}>{busy===row.requestId?"Reviewing...":"Approve & Verify"}</button></div></article>)}</section></section></main>
}
